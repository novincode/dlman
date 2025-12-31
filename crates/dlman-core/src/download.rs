//! Simple, reliable download engine for DLMan
//!
//! Key principles:
//! - One SimpleDownloadTask per file owns the file handle
//! - Direct HTTP stream to file writes (no complex channels)
//! - Atomic counters for progress tracking
//! - Time-based speed limiting (no token buckets)
//! - Atomic flags for pause/resume/cancel
//! - Multi-segment with direct writes (no coordination needed)

use crate::error::DlmanError;
use crate::DlmanCore;
use dlman_types::{CoreEvent, Download, DownloadStatus, LinkInfo};
use futures::StreamExt;
use reqwest::Client;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio::sync::broadcast;
use tokio::sync::RwLock as AsyncRwLock;
use chrono::Utc;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Simple download task - one per download, owns the file handle
#[derive(Debug)]
pub struct SimpleDownloadTask {
    /// Download metadata
    download: Download,
    /// File handle (owned by this task)
    file: AsyncRwLock<File>,
    /// Progress tracking
    downloaded_bytes: AtomicU64,
    /// Total file size (if known)
    total_size: u64,
    /// Speed limit in bytes per second (0 = unlimited)
    speed_limit: AtomicU64,
    /// Pause flag
    paused: AtomicBool,
    /// Cancel flag
    cancelled: AtomicBool,
    /// Event broadcaster
    event_tx: broadcast::Sender<CoreEvent>,
    /// Core reference for updates
    core: DlmanCore,
}

impl SimpleDownloadTask {
    /// Create a new download task
    pub async fn new(
        download: Download,
        event_tx: broadcast::Sender<CoreEvent>,
        core: DlmanCore,
    ) -> Result<Self, DlmanError> {
        // Create destination path (handle conflicts)
        let dest_path = download.destination.join(&download.filename);
        let dest_path = get_unique_path(&dest_path).await;

        // Open/create file
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .read(true)
            .open(&dest_path)
            .await?;

        // Check existing file size for resume
        let existing_size = file.metadata().await?.len();
        info!("Download {}: existing file size = {} bytes, total_size = {:?}", download.id, existing_size, download.size);

        let total_size = download.size.unwrap_or(0);

        Ok(Self {
            download: download.clone(),
            file: AsyncRwLock::new(file),
            downloaded_bytes: AtomicU64::new(existing_size),
            total_size,
            speed_limit: AtomicU64::new(download.speed_limit.unwrap_or(0)),
            paused: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
            event_tx,
            core,
        })
    }

    /// Start the download with multi-segment support
    pub async fn start(self: Arc<Self>, client: Client) -> Result<(), DlmanError> {
        let id = self.download.id;
        info!("Starting simple download {}: {}", id, self.download.url);

        // Determine number of segments
        let num_segments = if self.total_size > 1024 * 1024 && self.download.segments.len() > 1 {
            self.download.segments.len()
        } else {
            1 // Single segment for small files or unknown size
        };

        info!("Download {}: total_size={}, segments.len()={}, using {} segments",
              self.download.id, self.total_size, self.download.segments.len(), num_segments);

        if num_segments == 1 {
            info!("Download {}: using single segment download", self.download.id);
            // Single segment download
            self.download_single_segment(client).await
        } else {
            info!("Download {}: using multi-segment download", self.download.id);
            // Multi-segment download
            self.download_multi_segment(client, num_segments).await
        }
    }

    /// Download a single segment directly to file
    async fn download_single_segment(self: Arc<Self>, client: Client) -> Result<(), DlmanError> {
        let id = self.download.id;
        let url = self.download.url.clone();

        // Check if we need to resume
        let current_pos = self.downloaded_bytes.load(Ordering::Acquire);
        info!("Download {}: starting download from position {} (total_size: {})", id, current_pos, self.total_size);

        // Build request with range if resuming
        let request = if current_pos > 0 {
            info!("Download {}: resuming with range bytes={}-", id, current_pos);
            client.get(&url).header("Range", format!("bytes={}-", current_pos))
        } else {
            info!("Download {}: starting fresh download", id);
            client.get(&url)
        };

        let response = request.send().await?;
        let mut stream = response.bytes_stream();

        let mut last_progress_time = Instant::now();
        let mut last_chunk_time = Instant::now();

        while let Some(chunk_result) = stream.next().await {
            // Check cancel
            if self.cancelled.load(Ordering::Acquire) {
                info!("Download {} cancelled", id);
                return Ok(());
            }

            // Check pause (non-blocking wait)
            while self.paused.load(Ordering::Acquire) {
                tokio::time::sleep(Duration::from_millis(100)).await;
                if self.cancelled.load(Ordering::Acquire) {
                    info!("Download {} cancelled during pause", id);
                    return Ok(());
                }
            }

            let chunk = chunk_result?;
            let chunk_len = chunk.len() as u64;

            // Apply speed limiting (simple time-based)
            if let Some(limit) = self.get_speed_limit() {
                if limit > 0 {
                    let expected_duration = Duration::from_secs_f64(chunk_len as f64 / limit as f64);
                    let elapsed = last_chunk_time.elapsed();
                    if elapsed < expected_duration {
                        tokio::time::sleep(expected_duration - elapsed).await;
                    }
                }
            }

            // Write directly to file
            {
                self.file.write().await.write_all(&chunk).await?;
            }

            // Update progress
            let new_downloaded = self.downloaded_bytes.fetch_add(chunk_len, Ordering::AcqRel) + chunk_len;
            last_chunk_time = Instant::now();

            // Emit progress event (throttled to ~4x per second)
            if last_progress_time.elapsed() >= Duration::from_millis(250) {
                let _ = self.event_tx.send(CoreEvent::DownloadProgress {
                    id,
                    downloaded: new_downloaded,
                    total: if self.total_size > 0 { Some(self.total_size) } else { None },
                    speed: self.calculate_speed(),
                    eta: self.calculate_eta(),
                });
                last_progress_time = Instant::now();
            }
        }

        // Final sync and check completion
        {
            let mut file = self.file.write().await;
            file.sync_all().await?;
        }

        let final_downloaded = self.downloaded_bytes.load(Ordering::Acquire);
        if self.total_size > 0 && final_downloaded >= self.total_size {
            info!("Download {} completed successfully", id);
            self.emit_status_change(DownloadStatus::Completed, None).await;
        } else if self.total_size == 0 {
            // Unknown size, assume complete
            info!("Download {} completed (unknown size)", id);
            self.emit_status_change(DownloadStatus::Completed, None).await;
        }

        Ok(())
    }

    /// Download with multiple segments (sequential for simplicity)
    async fn download_multi_segment(self: Arc<Self>, client: Client, num_segments: usize) -> Result<(), DlmanError> {
        let id = self.download.id;
        let url = self.download.url.clone();

        info!("Starting multi-segment download for {} with {} segments, total_size: {}", id, num_segments, self.total_size);

        // Calculate segments
        let segments = calculate_segments(self.total_size, num_segments);
        info!("Calculated segments: {:?}", segments);

        // Download each segment sequentially
        for (segment_idx, (start, end)) in segments.into_iter().enumerate() {
            info!("Processing segment {} of {} for {}: bytes {}-{}", segment_idx + 1, num_segments, id, start, end);

            // Check if we already have this segment (resume)
            let current_pos = self.downloaded_bytes.load(Ordering::Acquire);
            info!("Current downloaded position: {}", current_pos);

            if current_pos > end {
                info!("Segment {} already fully downloaded ({} > {}), skipping", segment_idx, current_pos, end);
                // Update segment as complete
                self.update_segment_progress(segment_idx as u32, (end - start + 1) as u64).await;
                continue;
            }

            // Adjust start position for resume
            let segment_start = start.max(current_pos);
            if segment_start >= end {
                info!("Segment {} already complete (start: {}, end: {}, segment_start: {})", segment_idx, start, end, segment_start);
                // Update segment as complete
                self.update_segment_progress(segment_idx as u32, (end - start + 1) as u64).await;
                continue; // Segment already complete
            }

            info!("Downloading segment {} from {} to {}", segment_idx, segment_start, end);
            // Download this segment
            Arc::clone(&self).download_segment_with_progress(&client, &url, segment_start, end, segment_idx as u32).await?;
            // Mark segment as complete
            self.update_segment_progress(segment_idx as u32, (end - start + 1) as u64).await;
        }

        // Final check and sync
        {
            let mut file = self.file.write().await;
            file.sync_all().await?;
        }

        let final_downloaded = self.downloaded_bytes.load(Ordering::Acquire);
        if self.total_size > 0 && final_downloaded >= self.total_size {
            info!("Download {} completed successfully", id);
            self.emit_status_change(DownloadStatus::Completed, None).await;
        }

        Ok(())
    }

    /// Update segment progress
    async fn update_segment_progress(&self, segment_index: u32, downloaded: u64) {
        // Emit segment progress event
        let _ = self.event_tx.send(CoreEvent::SegmentProgress {
            download_id: self.download.id,
            segment_index,
            downloaded,
        });
    }

    /// Download a single segment (used by both single and multi-segment downloads)
    async fn download_segment_with_progress(self: Arc<Self>, client: &Client, url: &str, start: u64, end: u64, segment_index: u32) -> Result<(), DlmanError> {
        let id = self.download.id;

        // Build range request
        let range_header = format!("bytes={}-{}", start, end);
        let response = client.get(url).header("Range", range_header).send().await?;
        let mut stream = response.bytes_stream();

        let mut last_progress_time = Instant::now();
        let mut last_chunk_time = Instant::now();
        let mut segment_pos = start;
        let mut segment_downloaded = 0u64;

        while let Some(chunk_result) = stream.next().await {
            // Check cancel first
            if self.cancelled.load(Ordering::Acquire) {
                info!("Download {} cancelled", id);
                return Ok(());
            }

            // Check pause BEFORE processing chunk (non-blocking wait)
            let mut was_paused = false;
            while self.paused.load(Ordering::Acquire) {
                if !was_paused {
                    info!("Download {} paused, waiting to resume", id);
                    was_paused = true;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
                if self.cancelled.load(Ordering::Acquire) {
                    info!("Download {} cancelled during pause", id);
                    return Ok(());
                }
            }
            // Reset timing after pause to avoid speed limit issues
            if was_paused {
                info!("Download {} resumed, resetting timing", id);
                last_chunk_time = Instant::now();
            }

            let chunk = chunk_result?;
            let chunk_len = chunk.len() as u64;

            // Apply speed limiting (simple time-based)
            if let Some(limit) = self.get_speed_limit() {
                if limit > 0 {
                    let expected_duration = Duration::from_secs_f64(chunk_len as f64 / limit as f64);
                    let elapsed = last_chunk_time.elapsed();
                    if elapsed < expected_duration {
                        tokio::time::sleep(expected_duration - elapsed).await;
                    }
                }
            }

            // Write directly to file at correct position
            {
                let mut file = self.file.write().await;
                file.seek(std::io::SeekFrom::Start(segment_pos)).await?;
                file.write_all(&chunk).await?;
            }

            // Update progress
            segment_pos += chunk_len;
            segment_downloaded += chunk_len;
            let new_downloaded = self.downloaded_bytes.fetch_add(chunk_len, Ordering::AcqRel) + chunk_len;
            last_chunk_time = Instant::now();

            // Emit progress events (throttled to ~4x per second)
            if last_progress_time.elapsed() >= Duration::from_millis(250) {
                // Emit download progress
                let _ = self.event_tx.send(CoreEvent::DownloadProgress {
                    id,
                    downloaded: new_downloaded,
                    total: if self.total_size > 0 { Some(self.total_size) } else { None },
                    speed: self.calculate_speed(),
                    eta: self.calculate_eta(),
                });

                // Emit segment progress for multi-segment downloads
                let _ = self.event_tx.send(CoreEvent::SegmentProgress {
                    download_id: id,
                    segment_index,
                    downloaded: segment_downloaded,
                });

                last_progress_time = Instant::now();
            }
        }

        Ok(())
    }

    /// Get current speed limit
    fn get_speed_limit(&self) -> Option<u64> {
        let limit = self.speed_limit.load(Ordering::Acquire);
        if limit > 0 { Some(limit) } else { None }
    }

    /// Update speed limit
    pub fn set_speed_limit(&self, limit: u64) {
        self.speed_limit.store(limit, Ordering::Release);
    }

    /// Pause download
    pub fn pause(&self) {
        self.paused.store(true, Ordering::Release);
        info!("Download {} paused", self.download.id);
    }

    /// Resume download
    pub fn resume(&self) {
        info!("SimpleDownloadTask.resume called for {}, setting paused=false", self.download.id);
        self.paused.store(false, Ordering::Release);
        info!("Download {} resumed, paused flag is now {}", self.download.id, self.paused.load(Ordering::Acquire));
    }

    /// Cancel download
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        info!("Download {} cancelled", self.download.id);
    }

    /// Calculate current speed in bytes per second
    fn calculate_speed(&self) -> u64 {
        // For now, return a simple estimation
        // TODO: Implement proper speed tracking with moving averages
        let downloaded = self.downloaded_bytes.load(Ordering::Acquire);
        let now = Utc::now();
        let elapsed_ms = (now - self.download.created_at).num_milliseconds() as u64;

        if downloaded == 0 || elapsed_ms == 0 {
            return 0;
        }

        // Simple bytes per second calculation
        (downloaded * 1000) / elapsed_ms
    }

    /// Calculate ETA in seconds
    fn calculate_eta(&self) -> Option<u64> {
        let speed = self.calculate_speed();
        if speed == 0 {
            return None;
        }

        let remaining = self.total_size.saturating_sub(self.downloaded_bytes.load(Ordering::Acquire));
        if remaining == 0 {
            return Some(0);
        }

        Some(remaining / speed)
    }

    /// Emit status change event
    async fn emit_status_change(&self, status: DownloadStatus, error: Option<String>) {
        let _ = self.event_tx.send(CoreEvent::DownloadStatusChanged {
            id: self.download.id,
            status,
            error,
        });
    }
}

/// Calculate segments for multi-segment download
pub fn calculate_segments(total_size: u64, num_segments: usize) -> Vec<(u64, u64)> {
    if num_segments <= 1 || total_size < 1024 * 1024 {
        // Single segment for small files
        return vec![(0, total_size.saturating_sub(1))];
    }

    let segment_size = total_size / num_segments as u64;
    let mut segments = Vec::new();

    for i in 0..num_segments {
        let start = i as u64 * segment_size;
        let end = if i == num_segments - 1 {
            total_size.saturating_sub(1)
        } else {
            (i as u64 + 1) * segment_size - 1
        };
        segments.push((start, end));
    }

    segments
}

/// Get unique path (avoid conflicts)
async fn get_unique_path(path: &std::path::Path) -> PathBuf {
    let mut counter = 1;
    let mut new_path = path.to_path_buf();

    while new_path.exists() {
        let stem = path.file_stem().unwrap_or_default();
        let extension = path.extension().unwrap_or_default();
        let new_name = format!(
            "{} ({}).{}",
            stem.to_string_lossy(),
            counter,
            extension.to_string_lossy()
        );
        new_path = path.with_file_name(new_name);
        counter += 1;

        // Safety limit
        if counter > 10000 {
            return new_path;
        }
    }

    new_path
}

/// Download manager using simple architecture
#[derive(Debug)]
pub struct DownloadManager {
    client: Client,
    active_tasks: Arc<AsyncRwLock<std::collections::HashMap<Uuid, Arc<SimpleDownloadTask>>>>,
    event_tx: broadcast::Sender<CoreEvent>,
}

impl DownloadManager {
    pub fn new(event_tx: broadcast::Sender<CoreEvent>) -> Self {
        let client = Client::builder()
            .user_agent("DLMan/1.0.0")
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(60)) // Read timeout
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            active_tasks: Arc::new(AsyncRwLock::new(std::collections::HashMap::new())),
            event_tx,
        }
    }

    /// Probe URL for metadata
    pub async fn probe_url(&self, url: &url::Url) -> Result<LinkInfo, DlmanError> {
        info!("Probing URL: {}", url);

        let response = self.client.head(url.as_str()).send().await?;

        let final_url = response.url().to_string();
        let size = response
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok());
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let resumable = response
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .map(|v| v.to_str().unwrap_or("") == "bytes")
            .unwrap_or(false);

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

    /// Start a download
    pub async fn start(&self, download: Download, core: DlmanCore) -> Result<(), DlmanError> {
        let id = download.id;
        info!("Starting download {}: {}", id, download.url);

        if self.active_tasks.read().await.contains_key(&id) {
            warn!("Download {} is already running", id);
            return Ok(());
        }

        let task = Arc::new(SimpleDownloadTask::new(
            download,
            self.event_tx.clone(),
            core,
        ).await?);

        self.active_tasks.write().await.insert(id, Arc::clone(&task));

        let client = self.client.clone();
        let active_tasks = Arc::clone(&self.active_tasks);

        tokio::spawn(async move {
            info!("Spawned download task for {}", id);
            let result = task.start(client).await;

            match &result {
                Ok(_) => info!("Download {} completed successfully", id),
                Err(e) => error!("Download {} failed: {}", id, e),
            }

            info!("Removing task {} from active tasks", id);
            active_tasks.write().await.remove(&id);
        });

        Ok(())
    }

    /// Pause download
    pub async fn pause(&self, id: Uuid) -> Result<(), DlmanError> {
        if let Some(task) = self.active_tasks.read().await.get(&id) {
            task.pause();
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Resume download
    pub async fn resume(&self, id: Uuid, core: DlmanCore) -> Result<(), DlmanError> {
        info!("DownloadManager.resume called for {}", id);

        let active_task_count = self.active_tasks.read().await.len();
        info!("Currently {} active tasks", active_task_count);

        // Check if there's an active task (paused in same session)
        if let Some(task) = self.active_tasks.read().await.get(&id) {
            info!("Found active task for {}, paused={}, calling resume", id, task.paused.load(Ordering::Acquire));
            task.resume();
            return Ok(());
        }

        // No active task - create new one (app restart scenario)
        info!("No active task for {}, creating new download task for resume", id);
        let download = core.get_download(id).await?;
        info!("Got download from storage: status={:?}, downloaded={}", download.status, download.downloaded);
        self.start(download, core).await
    }

    /// Cancel download
    pub async fn cancel(&self, id: Uuid) -> Result<(), DlmanError> {
        if let Some(task) = self.active_tasks.read().await.get(&id) {
            task.cancel();
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Update speed limit
    pub async fn update_speed_limit(&self, id: Uuid, limit: u64) -> Result<(), DlmanError> {
        if let Some(task) = self.active_tasks.read().await.get(&id) {
            task.set_speed_limit(limit);
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }
}

/// Public function for calculating segments (used by lib.rs)
pub fn calculate_segments_public(total_size: u64, num_segments: usize) -> Vec<dlman_types::Segment> {
    calculate_segments(total_size, num_segments)
        .into_iter()
        .enumerate()
        .map(|(i, (start, end))| dlman_types::Segment {
            index: i as u32,
            start,
            end,
            downloaded: 0,
            complete: false,
        })
        .collect()
}
