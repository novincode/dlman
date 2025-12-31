//! IDM/FDM-style download engine with professional architecture
//!
//! Key principles:
//! - Single DownloadCoordinator as authority
//! - Dumb SegmentWorkers that send (offset, bytes) to coordinator
//! - Single DiskWriter for file I/O
//! - Global TokenBucket speed limiter
//! - File-based progress (bytes written to disk)
//! - Pause without aborting connections

use crate::error::DlmanError;
use crate::DlmanCore;
use dlman_types::{CoreEvent, Download, DownloadStatus, LinkInfo, Segment};
use futures::StreamExt;
use reqwest::Client;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio::sync::{broadcast, mpsc, Mutex, RwLock as AsyncRwLock, Semaphore};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Global token bucket rate limiter - shared across ALL segments
/// Guarantees accurate speed limiting within ~1-2% precision
#[derive(Debug)]
pub struct GlobalTokenBucket {
    capacity: AtomicU64,
    tokens: AtomicU64,
    fill_rate: AtomicU64, // tokens per second
    last_fill: Mutex<Instant>,
}

impl GlobalTokenBucket {
    pub fn new(bytes_per_second: u64) -> Self {
        Self {
            capacity: AtomicU64::new(bytes_per_second),
            tokens: AtomicU64::new(bytes_per_second),
            fill_rate: AtomicU64::new(bytes_per_second),
            last_fill: Mutex::new(Instant::now()),
        }
    }

    /// Wait until we can consume the specified number of bytes
    pub async fn acquire(&self, bytes: u64) {
        loop {
            // Refill tokens based on elapsed time
            self.refill_tokens().await;

            let current_tokens = self.tokens.load(Ordering::Acquire);
            if current_tokens >= bytes {
                // Try to consume tokens atomically
                if self.tokens.compare_exchange(
                    current_tokens,
                    current_tokens - bytes,
                    Ordering::AcqRel,
                    Ordering::Acquire
                ).is_ok() {
                    break;
                }
                // CAS failed, retry
            } else {
                // Not enough tokens, wait a bit
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }
    }

    async fn refill_tokens(&self) {
        let mut last_fill = self.last_fill.lock().await;
            let now = Instant::now();
        let elapsed = now.duration_since(*last_fill).as_secs_f64();

        if elapsed >= 0.001 { // Only refill if at least 1ms has passed
            let fill_rate = self.fill_rate.load(Ordering::Acquire);
            // Cap elapsed time to prevent overflow (max 1 second worth of tokens)
            let capped_elapsed = elapsed.min(1.0);
            let new_tokens = (capped_elapsed * fill_rate as f64) as u64;

            if new_tokens > 0 {
                let capacity = self.capacity.load(Ordering::Acquire);
                let current = self.tokens.load(Ordering::Acquire);

                // Add tokens up to capacity (prevent overflow)
                let new_total = current.saturating_add(new_tokens).min(capacity);
                self.tokens.store(new_total, Ordering::Release);

                *last_fill = now;
            }
        }
    }

    pub fn set_rate(&self, new_rate: u64) {
        self.fill_rate.store(new_rate, Ordering::Release);
        self.capacity.store(new_rate, Ordering::Release);

        // Reset tokens to new capacity
        self.tokens.store(new_rate, Ordering::Release);
    }

    pub fn get_rate(&self) -> u64 {
        self.fill_rate.load(Ordering::Acquire)
    }
}

/// Single disk writer that handles all file I/O
/// Receives (offset, data) from segment workers and writes to file
#[derive(Debug)]
pub struct DiskWriter {
    file: Mutex<File>,
    bytes_written: AtomicU64,
}

impl DiskWriter {
    pub async fn new(path: &Path) -> Result<Self, DlmanError> {
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(path)
            .await?;

        Ok(Self {
            file: Mutex::new(file),
            bytes_written: AtomicU64::new(0),
        })
    }

    pub async fn new_with_initial_bytes(path: &Path, initial_bytes: u64) -> Result<Self, DlmanError> {
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(path)
            .await?;

        Ok(Self {
            file: Mutex::new(file),
            bytes_written: AtomicU64::new(initial_bytes),
        })
    }

    pub async fn write_at(&self, offset: u64, data: &[u8]) -> Result<(), DlmanError> {
        let mut file = self.file.lock().await;
        file.seek(std::io::SeekFrom::Start(offset)).await?;
        file.write_all(data).await?;
        file.flush().await?;

        self.bytes_written.fetch_add(data.len() as u64, Ordering::AcqRel);
        Ok(())
    }

    pub fn bytes_written(&self) -> u64 {
        self.bytes_written.load(Ordering::Acquire)
    }

    pub async fn finalize(&self) -> Result<(), DlmanError> {
        let mut file = self.file.lock().await;
        file.flush().await?;
        file.sync_all().await?;
        Ok(())
    }
}

/// Dumb segment worker - fetches byte ranges and sends to coordinator
#[derive(Debug)]
struct SegmentWorker {
    segment_id: u32,
    start: u64,
    end: u64,
    downloaded: u64,
}

impl SegmentWorker {
    fn new(segment_id: u32, start: u64, end: u64, downloaded: u64) -> Self {
        Self {
            segment_id,
            start,
            end,
            downloaded,
        }
    }

    /// Download this segment, sending data to the coordinator
    async fn download(
        self,
        client: &Client,
        url: &str,
        speed_limiter: &GlobalTokenBucket,
        pause_flag: &AtomicBool,
        cancel_token: &CancellationToken,
        data_tx: &mpsc::Sender<(u64, Vec<u8>)>,
    ) -> Result<(), DlmanError> {
        let current_pos = self.start + self.downloaded;
        let range = format!("bytes={}-{}", current_pos, self.end);
        info!("Segment {} downloading range: {} (start: {}, downloaded: {}, end: {})",
              self.segment_id, range, self.start, self.downloaded, self.end);

        let response = client
            .get(url)
            .header(reqwest::header::RANGE, range)
            .send()
            .await?;

        if !response.status().is_success() && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
            return Err(DlmanError::ServerError {
                status: response.status().as_u16(),
                message: response.status().to_string(),
            });
        }

        let mut stream = response.bytes_stream();

        while let Some(chunk_result) = tokio::select! {
            chunk = stream.next() => chunk,
            _ = cancel_token.cancelled() => {
                return Err(DlmanError::Cancelled);
            }
        } {
            // Check pause flag - keep connection alive but stop reading
            while pause_flag.load(Ordering::Acquire) {
                info!("Segment {} paused, sleeping...", self.segment_id);
                tokio::time::sleep(Duration::from_millis(50)).await;
                if cancel_token.is_cancelled() {
                    info!("Segment {} cancelled while paused", self.segment_id);
                    return Err(DlmanError::Cancelled);
                }
            }

            let chunk = chunk_result?;
            let chunk_size = chunk.len() as u64;

            // Apply global speed limiting
            speed_limiter.acquire(chunk_size).await;

            // Send data to coordinator for writing
            if data_tx.send((current_pos, chunk.to_vec())).await.is_err() {
                // Coordinator dropped, exit gracefully
                break;
            }

            // Update our position (but progress is tracked by coordinator)
            // This worker is dumb - coordinator handles all state
        }

        Ok(())
    }
}

/// DownloadCoordinator - Single authority for download management
/// Manages state, coordinates workers, handles speed limiting globally
#[derive(Debug)]
pub struct DownloadCoordinator {
    /// Core download information
    download: Arc<Mutex<Download>>,
    /// File destination
    dest_path: PathBuf,
    /// Single disk writer
    disk_writer: Arc<DiskWriter>,
    /// Global speed limiter
    speed_limiter: Arc<GlobalTokenBucket>,
    /// Pause flag - checked by workers to pause without aborting connections
    pause_flag: Arc<AtomicBool>,
    /// Cancellation token for hard cancellation
    cancel_token: CancellationToken,
    /// Segment ranges and progress
    segments: Vec<SegmentRange>,
    /// Event broadcaster
    event_tx: broadcast::Sender<CoreEvent>,
    /// Core reference for persistence
    core: DlmanCore,
}

/// Segment range with progress tracking
#[derive(Debug)]
struct SegmentRange {
    id: u32,
    start: u64,
    end: u64,
    downloaded: AtomicU64,
}

impl SegmentRange {
    fn new(id: u32, start: u64, end: u64) -> Self {
        Self {
            id,
            start,
            end,
            downloaded: AtomicU64::new(0),
        }
    }

    fn is_complete(&self) -> bool {
        self.downloaded.load(Ordering::Acquire) >= (self.end - self.start + 1)
    }

    fn bytes_remaining(&self) -> u64 {
        let expected = self.end - self.start + 1;
        let downloaded = self.downloaded.load(Ordering::Acquire);
        expected.saturating_sub(downloaded)
    }
}

impl DownloadCoordinator {
    pub async fn new(
        download: Download,
        dest_path: PathBuf,
        event_tx: broadcast::Sender<CoreEvent>,
        core: DlmanCore,
    ) -> Result<Self, DlmanError> {
        // Create segments (use existing if resuming, otherwise calculate new)
        let segments = if !download.segments.is_empty() {
            info!("Resuming download with {} existing segments", download.segments.len());
            // Resuming - restore from persisted segments
            download.segments.iter().enumerate().map(|(i, s)| {
                let range = SegmentRange::new(i as u32, s.start, s.end);
                range.downloaded.store(s.downloaded, Ordering::Release);
                info!("Restored segment {}: {}-{}, downloaded: {}", i, s.start, s.end, s.downloaded);
                range
            }).collect()
        } else {
            // New download - calculate segments based on file size
            let size = download.size.unwrap_or(0);
            let num_segments = if size > 100 * 1024 * 1024 { // > 100MB
                8
            } else if size > 10 * 1024 * 1024 { // > 10MB
                4
            } else if size > 1024 * 1024 { // > 1MB
                2
            } else {
                1 // Small files, single segment
            };
            info!("Creating {} new segments for {} bytes", num_segments, size);
            Self::calculate_segments(size, num_segments)
        };

        // Calculate initial bytes for DiskWriter (total downloaded so far)
        let initial_bytes = segments.iter()
            .map(|s| s.downloaded.load(Ordering::Acquire))
            .sum();

        let disk_writer = Arc::new(DiskWriter::new_with_initial_bytes(&dest_path, initial_bytes).await?);

        // Speed limit from download or global settings
        let settings = core.get_settings().await;
        let speed_limit = download.speed_limit
            .or(settings.global_speed_limit)
            .unwrap_or(u64::MAX);

        Ok(Self {
            download: Arc::new(Mutex::new(download)),
            dest_path,
            disk_writer,
            speed_limiter: Arc::new(GlobalTokenBucket::new(speed_limit)),
            pause_flag: Arc::new(AtomicBool::new(false)),
            cancel_token: CancellationToken::new(),
            segments,
            event_tx,
            core,
        })
    }

    /// Start the coordinated download
    pub async fn start_download(self: Arc<Self>, client: Client) -> Result<(), DlmanError> {
        let download = self.download.lock().await.clone();
        let url = download.final_url.as_ref().unwrap_or(&download.url);

        info!("Starting coordinated download for {}: {} segments", download.id, self.segments.len());
        for (i, segment) in self.segments.iter().enumerate() {
            let downloaded = segment.downloaded.load(Ordering::Acquire);
            let expected = segment.end - segment.start + 1;
            info!("Segment {}: downloaded {}/{} bytes, complete: {}", i, downloaded, expected, segment.is_complete());
        }

        // Update status to downloading
        {
            let mut dl = self.download.lock().await;
            dl.status = DownloadStatus::Downloading;
        }
        let _ = self.event_tx.send(CoreEvent::DownloadStatusChanged {
            id: download.id,
            status: DownloadStatus::Downloading,
            error: None,
        });

        // Send initial segment progress for all segments
        for segment in &self.segments {
            let segment_downloaded = segment.downloaded.load(Ordering::Acquire);
            let _ = self.event_tx.send(CoreEvent::SegmentProgress {
                download_id: download.id,
                segment_index: segment.id,
                downloaded: segment_downloaded,
            });
        }

        // Create channel for workers to send data to disk writer
        let (data_tx, mut data_rx) = mpsc::channel::<(u64, Vec<u8>)>(32);


        // Spawn workers for incomplete segments
        let mut worker_handles = Vec::new();
        let semaphore = Arc::new(Semaphore::new(4)); // Limit concurrent workers

        info!("Spawning workers for {} segments", self.segments.len());
        for (i, segment) in self.segments.iter().enumerate() {
            let downloaded = segment.downloaded.load(Ordering::Acquire);
            let expected = segment.end - segment.start + 1;
            let is_complete = segment.is_complete();

            info!("Segment {}: start={}, end={}, downloaded={}, expected={}, complete={}",
                  i, segment.start, segment.end, downloaded, expected, is_complete);

            if is_complete {
                info!("Skipping complete segment {}", i);
                continue;
            }

            info!("Spawning worker for segment {}", i);
            let segment_id = segment.id;
            let worker = SegmentWorker::new(
                segment.id,
                segment.start,
                segment.end,
                downloaded,
            );

            let client = client.clone();
            let url = url.clone();
            let speed_limiter = Arc::clone(&self.speed_limiter);
            let pause_flag = Arc::clone(&self.pause_flag);
            let cancel_token = self.cancel_token.clone();
            let data_tx = data_tx.clone();
            let semaphore = Arc::clone(&semaphore);

            let handle = tokio::spawn(async move {
                let permit_result = semaphore.acquire().await;
                if let Err(e) = permit_result {
                    error!("Failed to acquire semaphore for segment {}: {}", segment_id, e);
                    return Err(DlmanError::Unknown("Semaphore closed".to_string()));
                }
                let _permit = permit_result.unwrap();

                let result = worker.download(
                    &client,
                    &url,
                    &speed_limiter,
                    &pause_flag,
                    &cancel_token,
                    &data_tx,
                ).await;

                if let Err(e) = &result {
                    error!("Segment {} download failed: {}", segment_id, e);
                } else {
                    info!("Segment {} completed successfully", segment_id);
                }

                result
            });

            worker_handles.push(handle);
        }

        // Drop our sender so receiver knows when workers are done
        drop(data_tx);

        // Progress tracking
        let mut last_progress_update = Instant::now();
        let mut last_bytes_written = 0u64;

        // Process data from workers and handle progress
        loop {
            tokio::select! {
                // Receive data from workers
                Some((offset, data)) = data_rx.recv() => {
                    // Write data to disk
                    self.disk_writer.write_at(offset, &data).await?;

                    // Update segment progress
                    let data_len = data.len() as u64;
                    if let Some(segment) = self.segments.iter().find(|s| offset >= s.start && offset <= s.end) {
                        segment.downloaded.fetch_add(data_len, Ordering::AcqRel);
                    }

                    // Progress updates (file-based, not event-based)
                    let now = Instant::now();
                    let bytes_written = self.disk_writer.bytes_written();

                    if now.duration_since(last_progress_update) >= Duration::from_millis(100) {
                        let elapsed = now.duration_since(last_progress_update).as_secs_f64();
                        let speed = ((bytes_written - last_bytes_written) as f64 / elapsed) as u64;

                        let total_size = self.download.lock().await.size;
                        let eta = total_size.and_then(|t| {
                            if bytes_written < t {
                                Some(((t - bytes_written) as f64 / speed.max(1) as f64) as u64)
                            } else {
                                None
                            }
                        });

                        let _ = self.event_tx.send(CoreEvent::DownloadProgress {
                            id: download.id,
                            downloaded: bytes_written,
                            total: total_size,
                            speed,
                            eta,
                        });

                        // Send segment progress updates
                        for segment in &self.segments {
                            let segment_downloaded = segment.downloaded.load(Ordering::Acquire);
                            let _ = self.event_tx.send(CoreEvent::SegmentProgress {
                                download_id: download.id,
                                segment_index: segment.id,
                                downloaded: segment_downloaded,
                            });
                        }

                        // Persist progress to database
                        let updated_segments = self.segments.iter().map(|s| {
                            dlman_types::Segment {
                                index: s.id,
                                start: s.start,
                                end: s.end,
                                downloaded: s.downloaded.load(Ordering::Acquire),
                                complete: s.is_complete(),
                            }
                        }).collect::<Vec<_>>();

                        let _ = self.core.update_download_progress(
                            download.id,
                            bytes_written,
                            Some(updated_segments)
                        ).await;

                        last_progress_update = now;
                        last_bytes_written = bytes_written;
                    }
                }

                // Check if any worker completed (only if there are workers)
                (_result, _index, _remaining) = futures::future::select_all(&mut worker_handles), if !worker_handles.is_empty() => {
                    // A worker completed, continue processing
                }

                // Cancellation check
                _ = self.cancel_token.cancelled() => {
                    return Err(DlmanError::Cancelled);
                }
            }

            // Check if we're done (all workers completed AND no more data)
            if worker_handles.is_empty() && data_rx.is_closed() {
                break;
            }
        }

        // All workers completed, check if download is complete
        let download_info = self.download.lock().await;
        let total_size = download_info.size;
        let bytes_written = self.disk_writer.bytes_written();

        // Only mark as completed if we know the total size and have downloaded at least that much
        if let Some(expected_size) = total_size {
            if bytes_written >= expected_size {
                // Finalize file
                drop(download_info); // Release lock before finalize
                self.disk_writer.finalize().await?;

                let mut dl = self.download.lock().await;
                dl.status = DownloadStatus::Completed;
                dl.downloaded = bytes_written;

                let _ = self.event_tx.send(CoreEvent::DownloadStatusChanged {
                    id: dl.id,
                    status: DownloadStatus::Completed,
                    error: None,
                });
            } else {
                info!("Download {} finished with {} bytes but expected {} bytes", download_info.id, bytes_written, expected_size);
            }
        } else {
            info!("Download {} finished with {} bytes but size is unknown", download_info.id, bytes_written);
            // For downloads with unknown size, we can't know if it's complete
            // The UI will need to handle this case
        }

        Ok(())
    }

    /// Pause download (keep connections alive)
    pub async fn pause(&self) -> Result<(), DlmanError> {
        self.pause_flag.store(true, Ordering::Release);

        let mut dl = self.download.lock().await;
        dl.status = DownloadStatus::Paused;

        let _ = self.event_tx.send(CoreEvent::DownloadStatusChanged {
            id: dl.id,
            status: DownloadStatus::Paused,
            error: None,
        });

        Ok(())
    }

    /// Resume download
    pub async fn resume(&self) -> Result<(), DlmanError> {
        info!("DownloadCoordinator.resume called for download {}", self.download.lock().await.id);
        let was_paused = self.pause_flag.swap(false, Ordering::AcqRel);
        info!("DownloadCoordinator.resume: was_paused={}, now_paused={}", was_paused, self.pause_flag.load(Ordering::Acquire));

        let mut dl = self.download.lock().await;
        dl.status = DownloadStatus::Downloading;

        let _ = self.event_tx.send(CoreEvent::DownloadStatusChanged {
            id: dl.id,
            status: DownloadStatus::Downloading,
            error: None,
        });

        Ok(())
    }

    /// Cancel download (hard stop)
    pub async fn cancel(&self) -> Result<(), DlmanError> {
        self.cancel_token.cancel();

        let mut dl = self.download.lock().await;
        dl.status = DownloadStatus::Cancelled;

        let _ = self.event_tx.send(CoreEvent::DownloadStatusChanged {
            id: dl.id,
            status: DownloadStatus::Cancelled,
            error: None,
        });

        Ok(())
    }

    /// Update speed limit
    pub fn update_speed_limit(&self, new_limit: u64) {
        self.speed_limiter.set_rate(new_limit);
    }

    /// Calculate segment ranges for a file
    fn calculate_segments(total_size: u64, num_segments: u32) -> Vec<SegmentRange> {
        if total_size == 0 || num_segments == 0 {
            return vec![SegmentRange::new(0, 0, 0)];
        }

        let segment_size = total_size / num_segments as u64;
        let mut segments = Vec::new();

        for i in 0..num_segments {
            let start = i as u64 * segment_size;
            let end = if i == num_segments - 1 {
                total_size - 1
            } else {
                (i + 1) as u64 * segment_size - 1
            };

            segments.push(SegmentRange::new(i, start, end));
        }

        segments
    }
}

/// Public function for calculating segments (used by lib.rs)
pub fn calculate_segments_public(total_size: u64, num_segments: u32) -> Vec<Segment> {
    let segment_size = total_size / num_segments as u64;
    let mut segments = Vec::new();

    for i in 0..num_segments {
        let start = i as u64 * segment_size;
        let end = if i == num_segments - 1 {
            total_size - 1
        } else {
            (i + 1) as u64 * segment_size - 1
        };

        segments.push(Segment::new(i, start, end));
    }

    segments
}

/// Get a unique filename by appending (1), (2), etc. if file exists
async fn get_unique_path(base_path: &Path) -> PathBuf {
    if !base_path.exists() {
        return base_path.to_path_buf();
    }

    let parent = base_path.parent().unwrap_or(Path::new("."));
    let stem = base_path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let extension = base_path.extension().and_then(|e| e.to_str());

    let mut counter = 1;
    loop {
        let new_name = if let Some(ext) = extension {
            format!("{} ({}).{}", stem, counter, ext)
        } else {
            format!("{} ({})", stem, counter)
        };

        let new_path = parent.join(&new_name);
        if !new_path.exists() {
            return new_path;
        }
        counter += 1;

        // Safety limit to prevent infinite loop
        if counter > 10000 {
            return new_path;
        }
    }
}

/// Professional download manager using IDM/FDM architecture
///
/// Uses DownloadCoordinator as single authority for each download
#[derive(Debug)]
pub struct DownloadManager {
    /// HTTP client for all download operations
    client: Client,
    /// Active download coordinators
    active_coordinators: Arc<AsyncRwLock<HashMap<Uuid, Arc<DownloadCoordinator>>>>,
    /// Event broadcaster for UI updates
    event_tx: broadcast::Sender<CoreEvent>,
}

impl DownloadManager {
    pub fn new(event_tx: broadcast::Sender<CoreEvent>) -> Self {
        let client = Client::builder()
            .user_agent("DLMan/1.0.0")
            .connect_timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            active_coordinators: Arc::new(AsyncRwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// Probe a URL to get file information
    pub async fn probe_url(&self, url: &url::Url) -> Result<LinkInfo, DlmanError> {
        info!("Probing URL: {}", url);

        let response = self.client.head(url.as_str()).send().await?;

        // Follow redirects to get final URL
        let final_url = response.url().to_string();

        // Get content length
        let size = response
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok());

        // Get content type
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        // Check if resumable
        let resumable = response
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .map(|v| v.to_str().unwrap_or("") == "bytes")
            .unwrap_or(false);

        // Extract filename from Content-Disposition or URL
        let filename = response
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| {
                v.split("filename=")
                    .nth(1)
                    .map(|s| s.trim_matches('"').to_string())
            })
            .unwrap_or_else(|| {
                url.path_segments()
                    .and_then(|s| s.last())
                    .unwrap_or("download")
                    .to_string()
            });

        Ok(LinkInfo {
            url: url.to_string(),
            final_url: Some(final_url),
            filename,
            size,
            content_type,
            resumable,
            error: None,
        })
    }

    /// Start a new download using DownloadCoordinator
    pub async fn start(&self, download: Download, core: DlmanCore) -> Result<(), DlmanError> {
        let id = download.id;
        info!("Starting download {}: {} -> {:?}", id, download.url, download.destination.join(&download.filename));

        // Check if already running
        if self.active_coordinators.read().await.contains_key(&id) {
            warn!("Download {} is already running, skipping start", id);
            return Ok(());
        }

        // Create destination path
        let dest_path = download.destination.join(&download.filename);
        let dest_path = get_unique_path(&dest_path).await;

        // Create coordinator
        let coordinator = Arc::new(DownloadCoordinator::new(
            download,
            dest_path,
            self.event_tx.clone(),
            core.clone(),
        ).await?);

        self.active_coordinators.write().await.insert(id, Arc::clone(&coordinator));

        // Spawn download task
        let client = self.client.clone();
        let active_coordinators = Arc::clone(&self.active_coordinators);

        tokio::spawn(async move {
            let result = coordinator.start_download(client).await;

            match &result {
                Ok(_) => info!("Download completed successfully for {}", id),
                Err(e) => {
                    error!("Download failed for {}: {}", id, e);
                    // Note: Status updates are handled by the main download task
                }
            }

            // Cleanup
            active_coordinators.write().await.remove(&id);
        });

        Ok(())
    }

    /// Pause download (keeps connections alive, doesn't abort)
    pub async fn pause(&self, id: Uuid) -> Result<(), DlmanError> {
        if let Some(coordinator) = self.active_coordinators.read().await.get(&id) {
            coordinator.pause().await?;
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Resume a paused download
    pub async fn resume(&self, id: Uuid, core: DlmanCore) -> Result<(), DlmanError> {
        info!("DownloadManager.resume called for {}", id);

        // Always create a new coordinator for resume to ensure clean state
        // Remove any existing coordinator first
        self.active_coordinators.write().await.remove(&id);

        info!("Creating new coordinator for resume");

        // Get the download
        let download = match core.get_download(id).await {
            Ok(dl) => dl,
            Err(_) => {
                warn!("Download {} not found in core storage, cannot resume", id);
                return Ok(()); // Don't error if download doesn't exist in storage
            }
        };

        info!("Got download from storage: {} segments, status: {:?}", download.segments.len(), download.status);

        // Check if it's in a resumable state
        if matches!(download.status, DownloadStatus::Completed | DownloadStatus::Deleted) {
            return Err(DlmanError::InvalidOperation("Download cannot be resumed".to_string()));
        }

        // Create destination path
        let dest_path = download.destination.join(&download.filename);
        let dest_path = get_unique_path(&dest_path).await;

        // Create coordinator
        let coordinator = Arc::new(DownloadCoordinator::new(
            download,
            dest_path,
            self.event_tx.clone(),
            core.clone(),
        ).await?);

        self.active_coordinators.write().await.insert(id, Arc::clone(&coordinator));

        // Spawn download task
        let client = self.client.clone();
        let active_coordinators = Arc::clone(&self.active_coordinators);

        tokio::spawn(async move {
            let result = coordinator.start_download(client).await;

            match &result {
                Ok(_) => info!("Download resumed and completed successfully for {}", id),
                Err(e) => {
                    error!("Download failed during resume for {}: {}", id, e);
                    // Don't send status change here - let the UI handle it
                }
            }

            // Cleanup
            active_coordinators.write().await.remove(&id);
        });

        Ok(())
    }


    /// Cancel a download
    pub async fn cancel(&self, id: Uuid) -> Result<(), DlmanError> {
        if let Some(coordinator) = self.active_coordinators.write().await.remove(&id) {
            coordinator.cancel().await?;
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Update speed limit for a running download
    pub async fn update_speed_limit(&self, id: Uuid, speed_limit: u64) -> Result<(), DlmanError> {
        if let Some(coordinator) = self.active_coordinators.read().await.get(&id) {
            coordinator.update_speed_limit(speed_limit);

            // Update in download info too
            let mut dl = coordinator.download.lock().await;
            dl.speed_limit = Some(speed_limit);

            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Check if a download is paused
    pub async fn is_paused(&self, id: Uuid) -> bool {
        if let Some(coordinator) = self.active_coordinators.read().await.get(&id) {
            coordinator.pause_flag.load(Ordering::Acquire)
        } else {
            false
        }
    }
}
