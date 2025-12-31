//! Download manager and engine with proper async streaming architecture

use crate::error::DlmanError;
use crate::DlmanCore;
use dlman_types::{CoreEvent, Download, DownloadStatus, LinkInfo, Segment};
use futures::StreamExt;
use tokio::sync::RwLock as AsyncRwLock;
use reqwest::Client;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::fs::{File, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::{broadcast, mpsc, Mutex};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Progress update from a segment download task
#[derive(Debug, Clone)]
struct SegmentProgress {
    segment_index: u32,
    downloaded: u64,
}

/// State of a download segment
#[derive(Debug, Clone)]
struct SegmentState {
    index: u32,
    start: u64,
    end: u64,
    downloaded: u64,
    temp_path: PathBuf,
    complete: bool,
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

/// Manages all download operations
pub struct DownloadManager {
    /// HTTP client
    client: Client,
    /// Active download tasks and their cancellation tokens
    active: Arc<AsyncRwLock<HashMap<Uuid, CancellationToken>>>,
    /// Paused downloads (id -> pause flag)
    paused: Arc<AsyncRwLock<HashMap<Uuid, Arc<Mutex<bool>>>>>,
    /// Speed limits for active downloads (id -> speed limit in bytes/s)
    speed_limits: Arc<AsyncRwLock<HashMap<Uuid, Arc<Mutex<Option<u64>>>>>>,
    /// Event broadcaster
    event_tx: broadcast::Sender<CoreEvent>,
}

impl DownloadManager {
    pub fn new(event_tx: broadcast::Sender<CoreEvent>) -> Self {
        let client = Client::builder()
            .user_agent("DLMan/0.1.0")
            .connect_timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            active: Arc::new(AsyncRwLock::new(HashMap::new())),
            paused: Arc::new(AsyncRwLock::new(HashMap::new())),
            speed_limits: Arc::new(AsyncRwLock::new(HashMap::new())),
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

    /// Start a download
    pub async fn start(&self, download: Download, _core: DlmanCore) -> Result<(), DlmanError> {
        let id = download.id;

        // Check if already running
        if self.active.read().await.contains_key(&id) {
            warn!("Download {} is already running", id);
            return Ok(());
        }

        // Get retry settings before spawning (to avoid Send issues with DlmanCore)
        let settings = _core.get_settings().await;
        let max_retries = settings.max_retries;
        let retry_delay = std::time::Duration::from_secs(settings.retry_delay_seconds as u64);

        // Create cancellation token and pause flag
        let cancel_token = CancellationToken::new();
        let pause_flag = Arc::new(Mutex::new(false));
        let speed_limit = Arc::new(Mutex::new(download.speed_limit));

        self.active.write().await.insert(id, cancel_token.clone());
        self.paused.write().await.insert(id, Arc::clone(&pause_flag));
        self.speed_limits.write().await.insert(id, Arc::clone(&speed_limit));

        // Clone what we need for the task
        let client = self.client.clone();
        let event_tx = self.event_tx.clone();
        let active = Arc::clone(&self.active);
        let paused = Arc::clone(&self.paused);
        let speed_limits = Arc::clone(&self.speed_limits);
        
        // Spawn download task with automatic retry logic
        tokio::spawn(async move {
            let mut result = download_file(client.clone(), download.clone(), cancel_token.clone(), event_tx.clone(), _core.clone(), pause_flag.clone(), speed_limit.clone()).await;
            
            // If download failed and error is retryable, attempt automatic retries
            let should_retry = match &result {
                Err(e) => e.is_retryable() || matches!(e, DlmanError::Unknown(_)),
                Ok(_) => false,
            };
            
            if should_retry {
                let mut retry_count = download.retry_count;
                let mut current_download = download;
                
                // Attempt retries
                while retry_count < max_retries {
                    if result.is_ok() {
                        break;
                    }
                    
                    // Get error message for logging
                    let error_msg = match &result {
                        Err(e) => e.to_string(),
                        Ok(_) => String::new(),
                    };
                    
                    retry_count += 1;
                    info!(
                        "Retrying download {} (attempt {}/{}) after error: {}",
                        id, retry_count, max_retries, error_msg
                    );
                    
                    // Update retry count in current_download (we'll save it later)
                    current_download.retry_count = retry_count;
                    
                    // Wait before retrying
                    tokio::time::sleep(retry_delay).await;
                    
                    // Check if cancelled
                    if cancel_token.is_cancelled() {
                        result = Err(DlmanError::Cancelled);
                        break;
                    }
                    
                    // Retry the download
                    let retry_result = download_file(
                        client.clone(),
                        current_download.clone(),
                        cancel_token.clone(),
                        event_tx.clone(),
                        _core.clone(),
                        pause_flag.clone(),
                        speed_limit.clone(),
                    ).await;
                    
                    // Update result
                    result = retry_result;
                    
                    // If retry succeeded, break
                    if result.is_ok() {
                        info!("Download {} succeeded after {} retries", id, retry_count);
                        break;
                    }
                }
            }

            // Remove from active and paused
            active.write().await.remove(&id);
            paused.write().await.remove(&id);
            speed_limits.write().await.remove(&id);

            // Update status based on result
            match result {
                Ok(()) => {
                    info!("Download {} completed", id);
                    let _ = event_tx.send(CoreEvent::DownloadStatusChanged {
                        id,
                        status: DownloadStatus::Completed,
                        error: None,
                    });
                }
                Err(DlmanError::Cancelled) => {
                    info!("Download {} cancelled", id);
                }
                Err(e) => {
                    error!("Download {} failed after retries: {}", id, e);
                    let _ = event_tx.send(CoreEvent::DownloadStatusChanged {
                        id,
                        status: DownloadStatus::Failed,
                        error: Some(e.to_string()),
                    });
                }
            }
        });

        Ok(())
    }

    /// Pause a download
    pub async fn pause(&self, id: Uuid) -> Result<(), DlmanError> {
        let pause_flag = {
            let paused = self.paused.read().await;
            paused.get(&id).cloned()
        };
        if let Some(pause_flag) = pause_flag {
            *pause_flag.lock().await = true;
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Resume a download
    pub async fn resume(&self, id: Uuid) -> Result<(), DlmanError> {
        let pause_flag = {
            let paused = self.paused.read().await;
            paused.get(&id).cloned()
        };
        if let Some(pause_flag) = pause_flag {
            *pause_flag.lock().await = false;
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Cancel a download
    pub async fn cancel(&self, id: Uuid) -> Result<(), DlmanError> {
        if let Some(cancel_token) = self.active.write().await.remove(&id) {
            cancel_token.cancel();
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Update speed limit for a running download
    pub async fn update_speed_limit(&self, id: Uuid, speed_limit: Option<u64>) -> Result<(), DlmanError> {
        let speed_limit_ref = {
            let speed_limits = self.speed_limits.read().await;
            speed_limits.get(&id).cloned()
        };
        if let Some(speed_limit_ref) = speed_limit_ref {
            *speed_limit_ref.lock().await = speed_limit;
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Check if a download is paused
    pub async fn is_paused(&self, id: Uuid) -> bool {
        self.paused.read().await.contains_key(&id)
    }
}

/// Perform the actual file download with proper async streaming
async fn download_file(
    client: Client,
    download: Download,
    cancel_token: CancellationToken,
    event_tx: broadcast::Sender<CoreEvent>,
    core: DlmanCore,
    pause_flag: Arc<Mutex<bool>>,
    speed_limit: Arc<Mutex<Option<u64>>>,
) -> Result<(), DlmanError> {
    let url = download.final_url.as_ref().unwrap_or(&download.url);
    let base_dest_path = download.destination.join(&download.filename);

    info!("Starting download: {} -> {:?}", url, base_dest_path);
    info!("Destination directory: {:?}", download.destination);
    info!("Filename: {}", download.filename);

    // Create destination directory
    if let Some(parent) = base_dest_path.parent() {
        info!("Creating parent directory: {:?}", parent);
        tokio::fs::create_dir_all(parent).await?;
        info!("Parent directory created successfully");
    } else {
        warn!("No parent directory for path: {:?}", base_dest_path);
    }

    // For new downloads, get unique path. For resumed downloads, use existing file
    let dest_path = if download.downloaded > 0 {
        // Resuming - use existing file path
        base_dest_path
    } else {
        // New download - handle file collision
        get_unique_path(&base_dest_path).await
    };

    info!("Starting download: {} -> {:?} (resuming: {})", url, dest_path, download.downloaded > 0);

    // Check if we should use segments (files > 1MB and segments are initialized)
    let use_segments = !download.segments.is_empty() && download.size.is_some();

    if use_segments && download.size.is_some() {
        // Multi-segment download with proper async streaming
        download_segmented(client, url, &dest_path, download.clone(), cancel_token, event_tx, core, Arc::clone(&pause_flag), Arc::clone(&speed_limit)).await
    } else {
        // Single stream download with streaming
        let is_resuming = download.downloaded > 0;
        download_single(client, url, &dest_path, download.id, download.downloaded, is_resuming, Arc::clone(&speed_limit), cancel_token, event_tx, core).await
    }
}

/// Download file as a single stream with proper async streaming and speed limiting
async fn download_single(
    client: Client,
    url: &str,
    dest_path: &Path,
    id: Uuid,
    already_downloaded: u64,
    is_resuming: bool,
    speed_limit: Arc<Mutex<Option<u64>>>,
    cancel_token: CancellationToken,
    event_tx: broadcast::Sender<CoreEvent>,
    core: DlmanCore,
) -> Result<(), DlmanError> {
    // For resuming downloads, use range request
    let mut request = client.get(url);
    let mut total: Option<u64> = None;

    if is_resuming {
        // Use range request to resume from where we left off
        request = request.header(reqwest::header::RANGE, format!("bytes={}-", already_downloaded));
    }

    let response = request.send().await?;

    // Check response status - 206 Partial Content for resume, 200 for new
    if !(response.status().is_success() || response.status() == reqwest::StatusCode::PARTIAL_CONTENT) {
        return Err(DlmanError::ServerError {
            status: response.status().as_u16(),
            message: response.status().to_string(),
        });
    }

    // If we requested a range but got 200 OK, server doesn't support resume
    let actual_is_resuming = is_resuming && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;

    // For resume, total is from Content-Range header. For new, from Content-Length
    if actual_is_resuming {
        // Try to extract total from Content-Range header: "bytes start-end/total"
        if let Some(content_range) = response.headers().get("content-range").and_then(|v| v.to_str().ok()) {
            if let Some(total_str) = content_range.split('/').last() {
                total = total_str.parse().ok();
            }
        }
    } else {
        total = response.content_length();
        // If server doesn't support resume, we need to restart from beginning
        if is_resuming {
            warn!("Server doesn't support range requests, restarting download from beginning");
        }
    }

    let mut stream = response.bytes_stream();

    // Open file in append mode if actually resuming, create if new or fallback
    let mut file = if actual_is_resuming {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(dest_path)
            .await?
    } else {
        // Create/truncate file for new download or resume fallback
        File::create(dest_path).await?
    };

    let mut downloaded: u64 = if actual_is_resuming { already_downloaded } else { 0 };
    let mut last_update = std::time::Instant::now();
    let mut last_downloaded: u64 = downloaded;

    // Speed limiting state - use a token bucket approach
    let mut bucket_tokens: f64 = 0.0;
    let mut last_refill = std::time::Instant::now();

    while let Some(chunk_result) = tokio::select! {
        chunk = stream.next() => chunk,
        _ = cancel_token.cancelled() => {
            return Err(DlmanError::Cancelled);
        }
    } {
        let chunk = chunk_result?;
        let chunk_size = chunk.len() as u64;

        // Speed limiting using token bucket algorithm
        let current_speed_limit = *speed_limit.lock().await;
        if let Some(limit) = current_speed_limit {
            // Refill tokens based on time elapsed
            let now = std::time::Instant::now();
            let elapsed = now.duration_since(last_refill).as_secs_f64();
            bucket_tokens += elapsed * limit as f64;
            // Cap at 1 second worth of tokens (allow small bursts)
            bucket_tokens = bucket_tokens.min(limit as f64);
            last_refill = now;

            // If we don't have enough tokens, wait
            if (chunk_size as f64) > bucket_tokens {
                let tokens_needed = chunk_size as f64 - bucket_tokens;
                let wait_time = tokens_needed / limit as f64;
                // Cap wait time to prevent appearing stuck (max 500ms wait)
                let capped_wait = wait_time.min(0.5);
                if capped_wait > 0.001 {
                    tokio::time::sleep(std::time::Duration::from_secs_f64(capped_wait)).await;
                    // Refill tokens after sleeping
                    bucket_tokens += capped_wait * limit as f64;
                }
            }

            // Consume tokens for this chunk
            bucket_tokens -= chunk_size as f64;
            if bucket_tokens < 0.0 {
                bucket_tokens = 0.0;
            }
        }

        file.write_all(&chunk).await?;
        downloaded += chunk_size;

        // Throttle progress updates to every 100ms
        if last_update.elapsed() >= std::time::Duration::from_millis(100) {
            let elapsed = last_update.elapsed().as_secs_f64();
            let speed = ((downloaded - last_downloaded) as f64 / elapsed) as u64;
            let eta = total.map(|t| ((t - downloaded) as f64 / speed.max(1) as f64) as u64);

            let _ = event_tx.send(CoreEvent::DownloadProgress {
                id,
                downloaded,
                total,
                speed,
                eta,
            });

            // Update progress in database
            let _ = core.update_download_progress(id, downloaded, None).await;

            last_update = std::time::Instant::now();
            last_downloaded = downloaded;
        }
    }

    file.flush().await?;

    Ok(())
}

/// Download file using multiple segments with proper async streaming and concurrent tasks
async fn download_segmented(
    client: Client,
    url: &str,
    dest_path: &Path,
    download: Download,
    cancel_token: CancellationToken,
    event_tx: broadcast::Sender<CoreEvent>,
    core: DlmanCore,
    pause_flag: Arc<Mutex<bool>>,
    speed_limit: Arc<Mutex<Option<u64>>>,
) -> Result<(), DlmanError> {
    let total_size = download.size.ok_or(DlmanError::ResumeNotSupported)?;
    let id = download.id;

    info!("Starting segmented download: {} segments for {} bytes", download.segments.len().max(4), total_size);

    // Calculate segments if not already defined
    let segments = if download.segments.is_empty() {
        calculate_segments(total_size, 4)
    } else {
        download.segments.clone()
    };

    // Create temp directory for segments
    let temp_dir = dest_path.parent().unwrap_or(Path::new(".")).join(".dlman_temp");
    tokio::fs::create_dir_all(&temp_dir).await?;

    // Clean up any existing temp files for this download
    let _temp_pattern = format!("{}_*.part", id.simple());
    if let Ok(entries) = tokio::fs::read_dir(&temp_dir).await {
        use tokio_stream::wrappers::ReadDirStream;
        let mut stream = ReadDirStream::new(entries);
        while let Some(entry) = tokio_stream::StreamExt::next(&mut stream).await {
            if let Ok(entry) = entry {
                if let Some(name) = entry.file_name().to_str() {
                    if name.starts_with(&format!("{}_", id.simple())) && name.ends_with(".part") {
                        let _ = tokio::fs::remove_file(entry.path()).await;
                    }
                }
            }
        }
    }

    // Create channel for progress updates from segment tasks
    let (progress_tx, mut progress_rx) = mpsc::channel::<SegmentProgress>(32);

    // Create segment states
    let mut segment_states = Vec::new();
    for (i, segment) in segments.iter().enumerate() {
        let segment_state = SegmentState {
            index: segment.index,
            start: segment.start,
            end: segment.end,
            downloaded: segment.downloaded,
            temp_path: temp_dir.join(format!("{}_{}.part", id.simple(), i)),
            complete: segment.complete,
        };
        segment_states.push(segment_state);
    }

    // Spawn concurrent tasks for incomplete segments
    let mut handles = Vec::new();
    for segment_state in &segment_states {
        if segment_state.complete {
            continue;
        }

        let client = client.clone();
        let url = url.to_string();
        let segment = segment_state.clone();
        let cancel_token = cancel_token.clone();
        let pause_flag = Arc::clone(&pause_flag);
        let speed_limit = Arc::clone(&speed_limit);
        let progress_tx = progress_tx.clone();

        handles.push(tokio::spawn(async move {
            download_segment_task(client, &url, segment, cancel_token, progress_tx, pause_flag, speed_limit).await
        }));
    }

    // Drop the original sender so the receiver knows when all tasks are done
    drop(progress_tx);

    // Track progress from all segments
    let mut segment_progress: HashMap<u32, u64> = HashMap::new();
    let mut total_downloaded = download.downloaded;
    let mut last_update = std::time::Instant::now();
    let mut last_total_downloaded = total_downloaded;

    // Process progress updates in real-time
    while let Some(progress) = tokio::select! {
        progress = progress_rx.recv() => progress,
        _ = cancel_token.cancelled() => {
            return Err(DlmanError::Cancelled);
        }
    } {
        // Update segment progress
        segment_progress.insert(progress.segment_index, progress.downloaded);

        // Calculate total downloaded across all segments
        total_downloaded = segment_progress.values().sum();

        // Send progress update every 50ms for responsive UI
        if last_update.elapsed() >= std::time::Duration::from_millis(50) {
            let elapsed = last_update.elapsed().as_secs_f64();
            // Prevent overflow by ensuring we don't go backwards
            let progress_diff = if total_downloaded >= last_total_downloaded {
                total_downloaded - last_total_downloaded
            } else {
                0
            };
            let speed = (progress_diff as f64 / elapsed) as u64;
            let eta = if total_size > total_downloaded {
                Some(((total_size - total_downloaded) as f64 / speed.max(1) as f64) as u64)
            } else {
                None
            };

            // Send total progress
            let _ = event_tx.send(CoreEvent::DownloadProgress {
                id,
                downloaded: total_downloaded,
                total: Some(total_size),
                speed,
                eta,
            });

            // Update progress in database with segment progress
            let updated_segments = segment_states.iter().enumerate().map(|(i, state)| {
                let segment_downloaded = segment_progress.get(&(i as u32)).copied().unwrap_or(state.downloaded);
                dlman_types::Segment {
                    index: state.index,
                    start: state.start,
                    end: state.end,
                    downloaded: segment_downloaded,
                    complete: segment_downloaded >= (state.end - state.start + 1),
                }
            }).collect::<Vec<_>>();
            let _ = core.update_download_progress(id, total_downloaded, Some(updated_segments)).await;

            // Send segment progress updates
            for (segment_index, downloaded) in &segment_progress {
                let _ = event_tx.send(CoreEvent::SegmentProgress {
                    download_id: id,
                    segment_index: *segment_index,
                    downloaded: *downloaded,
                });
            }

            last_update = std::time::Instant::now();
            last_total_downloaded = total_downloaded;
        }
    }

    // Wait for all segment tasks to complete and collect any errors
    let mut segment_errors = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                // Store error but don't fail yet - we'll retry incomplete segments
                segment_errors.push(e);
            }
            Err(_) => {
                segment_errors.push(DlmanError::Unknown("Task panicked".to_string()));
            }
        }
    }

    // Check for incomplete segments and retry them
    let mut incomplete_segments = Vec::new();
    for (i, segment_state) in segment_states.iter().enumerate() {
        let expected_size = segment_state.end - segment_state.start + 1;
        let actual_downloaded = segment_progress.get(&(i as u32)).copied().unwrap_or(segment_state.downloaded);
        
        // Check if segment is incomplete
        if actual_downloaded < expected_size {
            // Verify file size matches
            let file_size = tokio::fs::metadata(&segment_state.temp_path)
                .await
                .map(|m| m.len())
                .unwrap_or(0);
            
            if file_size < expected_size {
                warn!(
                    "Segment {} incomplete: downloaded {} of {} bytes (file: {} bytes). Will retry.",
                    i, actual_downloaded, expected_size, file_size
                );
                incomplete_segments.push((i, segment_state.clone(), actual_downloaded));
            }
        }
    }

    // Retry incomplete segments up to 3 times
    if !incomplete_segments.is_empty() {
        const MAX_SEGMENT_RETRIES: u32 = 3;
        let mut retry_count = 0;
        
        while !incomplete_segments.is_empty() && retry_count < MAX_SEGMENT_RETRIES {
            retry_count += 1;
            info!("Retrying {} incomplete segments (attempt {}/{})", incomplete_segments.len(), retry_count, MAX_SEGMENT_RETRIES);
            
            // Wait a bit before retrying
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            
            // Create a new progress channel for retries (we don't need to track progress during retries)
            let (retry_progress_tx, _retry_progress_rx) = mpsc::channel::<SegmentProgress>(32);
            let mut new_handles = Vec::new();
            let mut still_incomplete = Vec::new();
            
            // Retry each incomplete segment
            for (_i, segment_state, current_downloaded) in incomplete_segments.iter() {
                let client = client.clone();
                let url = url.to_string();
                let mut segment = segment_state.clone();
                segment.downloaded = *current_downloaded; // Resume from where we left off
                let cancel_token = cancel_token.clone();
                let pause_flag = Arc::clone(&pause_flag);
                let speed_limit = Arc::clone(&speed_limit);
                let retry_progress_tx = retry_progress_tx.clone();
                
                new_handles.push(tokio::spawn(async move {
                    download_segment_task(client, &url, segment, cancel_token, retry_progress_tx, pause_flag, speed_limit).await
                }));
            }
            
            // Wait for retry attempts
            for handle in new_handles {
                let _ = handle.await;
            }
            
            // Check which segments are still incomplete by checking file sizes
            for (i, segment_state, _) in incomplete_segments.iter() {
                let expected_size = segment_state.end - segment_state.start + 1;
                let file_size = tokio::fs::metadata(&segment_state.temp_path)
                    .await
                    .map(|m| m.len())
                    .unwrap_or(0);
                
                if file_size < expected_size {
                    // Get current downloaded from file size
                    still_incomplete.push((*i, segment_state.clone(), file_size));
                } else {
                    // Segment completed, update progress
                    segment_progress.insert(*i as u32, expected_size);
                }
            }
            
            incomplete_segments = still_incomplete;
        }
        
        // If we still have incomplete segments after retries, fail the download
        if !incomplete_segments.is_empty() {
            let incomplete_info: Vec<String> = incomplete_segments
                .iter()
                .map(|(i, s, d)| format!("Segment {}: {}/{} bytes", i, d, s.end - s.start + 1))
                .collect();
            return Err(DlmanError::Unknown(format!(
                "Failed to complete segments after {} retries: {}",
                MAX_SEGMENT_RETRIES,
                incomplete_info.join(", ")
            )));
        }
    }

    // Final verification - all segments should be complete now
    for (i, segment_state) in segment_states.iter().enumerate() {
        let expected_size = segment_state.end - segment_state.start + 1;
        
        // Double-check temp file size
        if let Ok(metadata) = tokio::fs::metadata(&segment_state.temp_path).await {
            let file_size = metadata.len();
            if file_size != expected_size {
                return Err(DlmanError::Unknown(format!(
                    "Segment {} temp file size mismatch: {} vs expected {} after retries", 
                    i, file_size, expected_size
                )));
            }
        } else {
            return Err(DlmanError::Unknown(format!("Segment {} temp file missing after retries", i)));
        }
    }

    // All segments completed, merge into final file
    merge_segments_from_parts(dest_path, &segment_states).await?;

    Ok(())
}

/// Download a single segment as an async task with progress reporting
async fn download_segment_task(
    client: Client,
    url: &str,
    segment: SegmentState,
    cancel_token: CancellationToken,
    progress_tx: mpsc::Sender<SegmentProgress>,
    pause_flag: Arc<Mutex<bool>>,
    speed_limit: Arc<Mutex<Option<u64>>>,
) -> Result<(), DlmanError> {
    // Calculate range for this segment
    let start_byte = segment.start + segment.downloaded;
    let end_byte = segment.end;

    let range = format!("bytes={}-{}", start_byte, end_byte);

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
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&segment.temp_path)
        .await?;

    let mut downloaded = segment.downloaded;
    let mut last_update = std::time::Instant::now();

    // Speed limiting state - use a token bucket approach
    let mut bucket_tokens: f64 = 0.0;
    let mut last_refill = std::time::Instant::now();

    while let Some(chunk_result) = tokio::select! {
        chunk = stream.next() => chunk,
        _ = cancel_token.cancelled() => {
            return Err(DlmanError::Cancelled);
        }
    } {
        // Check if paused
        while *pause_flag.lock().await {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        let chunk = chunk_result?;
        let chunk_size = chunk.len() as u64;

        // Speed limiting using token bucket algorithm (same as single download)
        let current_speed_limit = *speed_limit.lock().await;
        if let Some(limit) = current_speed_limit {
            // Refill tokens based on time elapsed
            let now = std::time::Instant::now();
            let elapsed = now.duration_since(last_refill).as_secs_f64();
            bucket_tokens += elapsed * limit as f64;
            // Cap at 1 second worth of tokens (allow small bursts)
            bucket_tokens = bucket_tokens.min(limit as f64);
            last_refill = now;

            // If we don't have enough tokens, wait
            if (chunk_size as f64) > bucket_tokens {
                let tokens_needed = chunk_size as f64 - bucket_tokens;
                let wait_time = tokens_needed / limit as f64;
                // Cap wait time to prevent appearing stuck (max 500ms wait)
                let capped_wait = wait_time.min(0.5);
                if capped_wait > 0.001 {
                    tokio::time::sleep(std::time::Duration::from_secs_f64(capped_wait)).await;
                    // Refill tokens after sleeping
                    bucket_tokens += capped_wait * limit as f64;
                }
            }

            // Consume tokens for this chunk
            bucket_tokens -= chunk_size as f64;
            if bucket_tokens < 0.0 {
                bucket_tokens = 0.0;
            }
        }

        file.write_all(&chunk).await?;
        downloaded += chunk_size;

        // Send progress update every 100ms
        if last_update.elapsed() >= std::time::Duration::from_millis(100) {
            let progress = SegmentProgress {
                segment_index: segment.index,
                downloaded,
            };

            // Send progress update (ignore send errors if receiver is dropped)
            let _ = progress_tx.send(progress).await;

            last_update = std::time::Instant::now();
        }
    }

    file.flush().await?;

    // Verify segment is actually complete
    let expected_size = segment.end - segment.start + 1;
    let actual_size = downloaded;
    
    // Also check file size on disk
    let file_size = tokio::fs::metadata(&segment.temp_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    
    if actual_size < expected_size || file_size < expected_size {
        warn!(
            "Segment {} incomplete: downloaded {} of {} bytes (file: {} bytes)",
            segment.index, actual_size, expected_size, file_size
        );
        // Return error so caller can retry this segment
        return Err(DlmanError::Unknown(format!(
            "Segment {} incomplete: {} of {} bytes",
            segment.index,
            actual_size.max(file_size),
            expected_size
        )));
    }

    Ok(())
}

/// Calculate segment ranges for a file
pub fn calculate_segments(total_size: u64, num_segments: u32) -> Vec<Segment> {
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

/// Merge segment temp files into final file
async fn merge_segments_from_parts(dest_path: &Path, segments: &[SegmentState]) -> Result<(), DlmanError> {
    let mut dest_file = File::create(dest_path).await?;

    for segment in segments {
        if segment.temp_path.exists() {
            let data = tokio::fs::read(&segment.temp_path).await?;
            dest_file.write_all(&data).await?;
        }

        // Clean up temp file
        let _ = tokio::fs::remove_file(&segment.temp_path).await;
    }

    dest_file.flush().await?;

    Ok(())
}
