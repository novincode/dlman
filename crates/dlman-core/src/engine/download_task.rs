//! Download task - coordinates multiple segment workers
//!
//! This is the main orchestrator for a single download.
//! It spawns segment workers, monitors their progress, and merges temp files on completion.

use crate::engine::{DownloadDatabase, RateLimiter, SegmentWorker};
use crate::error::DlmanError;
use crate::request_scope::may_send_site_auth;
use dlman_types::{CoreEvent, Download, DownloadStatus, Segment, TempStorageSettings};
use reqwest::Client;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::broadcast;
use tokio::task::JoinSet;
use tracing::{error, info, warn};

/// Resolve the scratch directory for a download's partial segment files,
/// honoring the user's temp-storage policy.
///
/// This is the **single source of truth** for "where do in-progress parts
/// live" — both the active task and the delete/cleanup path go through here, so
/// changing the policy changes behavior everywhere at once. See
/// [`TempStorageSettings`] for the trade-offs behind each mode.
///
/// - `destination` is the download's target folder.
/// - `app_data_dir` is DLMan's per-user data directory (always on the system
///   disk).
/// - `size` is the total download size when known; the `auto` policy uses it to
///   decide whether the system disk can safely hold the scratch data.
///
/// Segment files inside the returned directory are namespaced by download id, so
/// a directory shared across downloads (appdata/custom) is safe for concurrent
/// use.
pub(crate) fn resolve_segment_cache_dir(
    policy: &TempStorageSettings,
    destination: &Path,
    app_data_dir: &Path,
    size: Option<u64>,
) -> PathBuf {
    let appdata_scratch = || app_data_dir.join("temp");
    let destination_scratch = || destination.join(".dlman-cache");

    match policy.mode.as_str() {
        // Keep partial data next to the final file, on the destination
        // filesystem. Best for huge files / external drives — it never fills the
        // system disk and keeps the merge on one volume. (Issue #7)
        "destination" => destination_scratch(),
        // Fast, fixed scratch on the system disk (the pre-1.11 behavior). Best
        // when the destination is a slow drive, e.g. an external HDD. (Issue #10)
        "appdata" => appdata_scratch(),
        // A user-picked folder (e.g. a fast SSD). Falls back to appdata if unset.
        "custom" => match &policy.custom_path {
            Some(p) if !p.as_os_str().is_empty() => p.clone(),
            _ => appdata_scratch(),
        },
        // "auto" (default): prefer the fast system-disk scratch, but fall back to
        // the destination when the system disk can't safely hold the download.
        // This fixes the slow-HDD regression (#10) for typical downloads without
        // reintroducing the system-disk-full failure on huge ones (#7).
        _ => {
            if appdata_has_room_for(app_data_dir, size) {
                appdata_scratch()
            } else {
                destination_scratch()
            }
        }
    }
}

/// Every directory a download's scratch files could plausibly live in under the
/// current policy. Used by the delete path to remove orphaned parts even if the
/// policy (or available free space, for `auto`) changed since the download
/// started. Order/dedup is best-effort; callers treat each as best-effort.
pub(crate) fn candidate_cache_dirs(
    policy: &TempStorageSettings,
    destination: &Path,
    app_data_dir: &Path,
) -> Vec<PathBuf> {
    let mut dirs = vec![
        destination.join(".dlman-cache"),
        app_data_dir.join("temp"),
    ];
    if let Some(p) = &policy.custom_path {
        if !p.as_os_str().is_empty() {
            dirs.push(p.clone());
        }
    }
    dirs.dedup();
    dirs
}

/// Whether the app-data (system disk) volume can comfortably hold `size` bytes
/// of scratch data. Unknown size is treated as "fits" (typical small/medium
/// files); if free space can't be determined we also err toward the system
/// disk, matching the long-standing pre-1.11 default. The `auto` destination
/// fallback exists for the genuinely-too-big case.
fn appdata_has_room_for(app_data_dir: &Path, size: Option<u64>) -> bool {
    let Some(size) = size else {
        return true;
    };
    // Keep ~1 GiB of headroom so a download never wedges the system disk.
    const HEADROOM: u64 = 1024 * 1024 * 1024;
    match fs2::available_space(app_data_dir) {
        Ok(available) => available >= size.saturating_add(HEADROOM),
        Err(_) => true,
    }
}

/// A download task that manages multiple segment workers
pub struct DownloadTask {
    pub download: Download,
    temp_dir: PathBuf,
    client: Client,
    rate_limiter: RateLimiter,
    db: DownloadDatabase,
    event_tx: broadcast::Sender<CoreEvent>,
    paused: Arc<AtomicBool>,
    cancelled: Arc<AtomicBool>,
    total_downloaded: Arc<AtomicU64>,
    /// Number of segments to use for multi-segment downloads
    segment_count: u32,
    /// Maximum number of retries for failed segments
    max_retries: u32,
    /// Delay between retries in seconds
    retry_delay_secs: u32,
    /// Optional credentials for authenticated downloads
    credentials: Option<(String, String)>,
}

impl DownloadTask {
    /// Create a new download task.
    ///
    /// `temp_dir` is the resolved scratch directory for this download's partial
    /// segment files (see [`resolve_segment_cache_dir`]). The caller owns the
    /// policy decision so the task itself stays agnostic about *where* scratch
    /// lives.
    pub fn new(
        download: Download,
        temp_dir: PathBuf,
        client: Client,
        rate_limiter: RateLimiter,
        db: DownloadDatabase,
        event_tx: broadcast::Sender<CoreEvent>,
        paused: Arc<AtomicBool>,
        cancelled: Arc<AtomicBool>,
        segment_count: u32,
        max_retries: u32,
        retry_delay_secs: u32,
    ) -> Self {
        Self::new_with_credentials(
            download, temp_dir, client, rate_limiter, db, event_tx,
            paused, cancelled, segment_count, max_retries, retry_delay_secs, None,
        )
    }

    /// Create a new download task with credentials. See [`Self::new`] for the
    /// meaning of `temp_dir`.
    pub fn new_with_credentials(
        download: Download,
        temp_dir: PathBuf,
        client: Client,
        rate_limiter: RateLimiter,
        db: DownloadDatabase,
        event_tx: broadcast::Sender<CoreEvent>,
        paused: Arc<AtomicBool>,
        cancelled: Arc<AtomicBool>,
        segment_count: u32,
        max_retries: u32,
        retry_delay_secs: u32,
        credentials: Option<(String, String)>,
    ) -> Self {
        // Calculate total downloaded from segments if available, otherwise use download.downloaded
        let total_from_segments: u64 = download.segments.iter().map(|s| s.downloaded).sum();
        let initial_downloaded = if total_from_segments > 0 {
            total_from_segments
        } else {
            download.downloaded
        };
        let total_downloaded = Arc::new(AtomicU64::new(initial_downloaded));
        
        Self {
            download,
            temp_dir,
            client,
            rate_limiter,
            db,
            event_tx,
            paused,
            cancelled,
            total_downloaded,
            segment_count,
            max_retries,
            retry_delay_secs,
            credentials,
        }
    }
    
    /// Get the effective URL for downloading segments
    /// Uses final_url (after redirects) if available, otherwise the original url
    fn effective_url(&self) -> &str {
        self.download.final_url.as_deref().unwrap_or(&self.download.url)
    }

    /// Credentials and cookies to send with a request to `url`.
    ///
    /// Both belong to the URL the user added, so they are left off once a
    /// redirect has moved the download to a different host.
    fn site_auth_for(&self, url: &str) -> (Option<(String, String)>, Option<String>) {
        if may_send_site_auth(&self.download.url, url) {
            (self.credentials.clone(), self.download.cookies.clone())
        } else {
            (None, None)
        }
    }
    
    /// Get the paused flag for external control
    pub fn paused(&self) -> Arc<AtomicBool> {
        self.paused.clone()
    }
    
    /// Get the cancelled flag for external control
    pub fn cancelled(&self) -> Arc<AtomicBool> {
        self.cancelled.clone()
    }
    
    /// Run the download task
    pub async fn run(mut self) -> Result<(), DlmanError> {
        info!("Starting download task for {}: {} with segment_count={}", 
              self.download.id, self.download.filename, self.segment_count);
        
        // Check for early pause/cancel
        if self.cancelled.load(Ordering::Acquire) {
            self.download.status = DownloadStatus::Cancelled;
            self.db.update_download_status(self.download.id, DownloadStatus::Cancelled, None).await?;
            self.emit_status_change(DownloadStatus::Cancelled, None).await;
            return Ok(());
        }
        if self.paused.load(Ordering::Acquire) {
            self.download.status = DownloadStatus::Paused;
            self.db.update_download_status(self.download.id, DownloadStatus::Paused, None).await?;
            self.emit_status_change(DownloadStatus::Paused, None).await;
            return Ok(());
        }
        
        // Update status to downloading
        self.download.status = DownloadStatus::Downloading;
        self.db.update_download_status(self.download.id, DownloadStatus::Downloading, None).await?;
        self.emit_status_change(DownloadStatus::Downloading, None).await;

        // Ensure the scratch directory exists before any segment worker writes
        // to it. Its location is chosen by the user's temp-storage policy (see
        // resolve_segment_cache_dir) and threaded in as self.temp_dir.
        if let Err(e) = tokio::fs::create_dir_all(&self.temp_dir).await {
            error!("Failed to create scratch directory {:?}: {}", self.temp_dir, e);
            return Err(DlmanError::Io(e));
        }

        // Emit initial progress so UI shows current state immediately
        let initial_downloaded = self.total_downloaded.load(Ordering::Acquire);
        let _ = self.event_tx.send(CoreEvent::DownloadProgress {
            id: self.download.id,
            downloaded: initial_downloaded,
            total: self.download.size,
            speed: 0,
            eta: None,
        });
        
        // If no segments, probe URL and initialize them
        if self.download.segments.is_empty() {
            info!("No segments found, initializing...");
            let supports_range = self.probe_url().await?;
            
            // Check for pause/cancel after probe (which might have taken time)
            if self.cancelled.load(Ordering::Acquire) {
                self.download.status = DownloadStatus::Cancelled;
                self.db.update_download_status(self.download.id, DownloadStatus::Cancelled, None).await?;
                self.emit_status_change(DownloadStatus::Cancelled, None).await;
                return Ok(());
            }
            if self.paused.load(Ordering::Acquire) {
                self.download.status = DownloadStatus::Paused;
                self.db.update_download_status(self.download.id, DownloadStatus::Paused, None).await?;
                self.emit_status_change(DownloadStatus::Paused, None).await;
                return Ok(());
            }
            
            if supports_range && self.download.size.unwrap_or(0) > 1024 * 1024 && self.segment_count > 1 {
                // Multi-segment download
                let num_segments = self.segment_count as usize;
                self.download.segments = self.calculate_segments(num_segments);
                info!("Initialized {} segments", num_segments);
            } else {
                // Single segment download (no range support, small file, or segment_count=1)
                let size = self.download.size.unwrap_or(u64::MAX);
                self.download.segments = vec![Segment {
                    index: 0,
                    start: 0,
                    end: if size == u64::MAX || size == 0 { u64::MAX } else { size - 1 },
                    downloaded: 0,
                    complete: false,
                }];
                info!("Initialized single segment (no range support or small file)");
            }
            
            // Save segments to DB
            self.db.upsert_download(&self.download).await?;
            
            // Emit update event so UI gets size and final URL
            let _ = self.event_tx.send(CoreEvent::DownloadUpdated {
                download: self.download.clone(),
            });
        }
        
        // Check if all segments are already complete (resuming a finished-but-not-merged download)
        let all_complete = self.download.segments.iter().all(|s| s.complete);
        
        if all_complete {
            info!("All segments already complete, skipping to merge");
        } else {
            // Spawn segment workers for incomplete segments
            let result = if self.download.segments.len() == 1 {
                self.download_single_segment().await
            } else {
                self.download_multi_segment().await
            };
            
            // Handle download result (pause/cancel)
            if let Err(e) = result {
                if matches!(e, DlmanError::Paused) {
                    info!("Download paused: {}", self.download.filename);
                    // Status already updated by pause command
                    return Ok(());
                } else if matches!(e, DlmanError::Cancelled) {
                    info!("Download cancelled: {}", self.download.filename);
                    self.download.status = DownloadStatus::Cancelled;
                    self.db.update_download_status(self.download.id, DownloadStatus::Cancelled, None).await?;
                    self.emit_status_change(DownloadStatus::Cancelled, None).await;
                    return Ok(());
                } else {
                    // Check if this is an authentication error — emit credential required event
                    if let DlmanError::AuthenticationRequired { ref domain, ref url, status } = e {
                        info!("Download requires authentication for domain: {}", domain);
                        let _ = self.event_tx.send(CoreEvent::CredentialRequired {
                            download_id: self.download.id,
                            domain: domain.clone(),
                            url: url.clone(),
                            status_code: status,
                        });
                    }
                    
                    error!("Download failed: {} - {}", self.download.filename, e);
                    self.download.status = DownloadStatus::Failed;
                    let error_msg = e.to_string();
                    self.download.error = Some(error_msg.clone());
                    self.db.update_download_status(self.download.id, DownloadStatus::Failed, Some(error_msg.clone())).await?;
                    self.emit_status_change(DownloadStatus::Failed, Some(error_msg)).await;
                    return Err(e);
                }
            }
        }
        
        // All segments complete - merge into final file
        info!("All segments complete, merging...");
        let segment_sizes = self.merge_segments().await?;
        
        // Update segments with actual file sizes and calculate total downloaded
        let mut total_downloaded: u64 = 0;
        for (i, segment) in self.download.segments.iter_mut().enumerate() {
            segment.complete = true;
            // Use the actual file size from merge (this is authoritative)
            if let Some(&actual_size) = segment_sizes.get(i) {
                segment.downloaded = actual_size;
                // For unknown size segments, also fix the end value
                if segment.is_unknown_size() && actual_size > 0 {
                    segment.end = segment.start.saturating_add(actual_size).saturating_sub(1);
                }
            }
            total_downloaded = total_downloaded.saturating_add(segment.downloaded);
        }
        
        // Update download size if it was unknown (discovered during download)
        if self.download.size.is_none() && total_downloaded > 0 {
            self.download.size = Some(total_downloaded);
            info!("Final download size determined: {} bytes", total_downloaded);
        }
        
        // Update status to completed
        self.download.status = DownloadStatus::Completed;
        self.download.downloaded = total_downloaded.max(self.download.size.unwrap_or(0));
        
        // Save the updated download with correct size info
        self.db.upsert_download(&self.download).await?;
        self.db.update_download_status(self.download.id, DownloadStatus::Completed, None).await?;
        self.emit_status_change(DownloadStatus::Completed, None).await;
        
        // Emit final download update so UI shows all segments complete
        let _ = self.event_tx.send(CoreEvent::DownloadUpdated {
            download: self.download.clone(),
        });
        
        info!("Download completed: {}", self.download.filename);
        Ok(())
    }
    
    /// Download with a single segment
    async fn download_single_segment(&mut self) -> Result<(), DlmanError> {
        let segment = self.download.segments[0].clone();
        
        // Check if already complete
        if segment.complete {
            return Ok(());
        }
        
        // Use final_url if available (after redirects), otherwise use original url
        let url = self.effective_url().to_string();
        let (credentials, cookies) = self.site_auth_for(&url);
        
        let worker = SegmentWorker::new_with_credentials(
            self.download.id,
            segment,
            url,
            self.temp_dir.clone(),
            self.client.clone(),
            self.rate_limiter.clone(),
            self.db.clone(),
            self.event_tx.clone(),
            self.paused.clone(),
            self.cancelled.clone(),
            self.total_downloaded.clone(),
            credentials,
            cookies,
        );
        
        // Start progress reporter
        let progress_handle = self.spawn_progress_reporter();
        
        // Run segment worker
        let result = worker.run().await;
        
        // Stop progress reporter
        self.cancelled.store(true, Ordering::Release);
        let _ = progress_handle.await;
        
        // Handle result - update size if discovered
        match result {
            Ok(segment_result) => {
                if let Some(size) = segment_result.discovered_size {
                    self.download.size = Some(size);
                    // Also update the segment end value so it's no longer u64::MAX
                    if !self.download.segments.is_empty() && self.download.segments[0].end == u64::MAX {
                        self.download.segments[0].end = size.saturating_sub(1);
                        self.download.segments[0].downloaded = size;
                    }
                    self.db.upsert_download(&self.download).await?;
                    let _ = self.event_tx.send(CoreEvent::DownloadUpdated {
                        download: self.download.clone(),
                    });
                    info!("Updated download size to {} bytes (discovered during download)", size);
                }
                Ok(())
            }
            Err(e) => Err(e),
        }
    }
    
    /// Download with multiple parallel segments
    async fn download_multi_segment(&self) -> Result<(), DlmanError> {
        let mut retry_counts: std::collections::HashMap<u32, u32> = std::collections::HashMap::new();
        
        // Start progress reporter
        let progress_handle = self.spawn_progress_reporter();
        
        // Segments that need to be downloaded (initially, all incomplete ones)
        let mut segments_to_download: Vec<Segment> = self.download.segments
            .iter()
            .filter(|s| !s.complete)
            .cloned()
            .collect();
        
        if segments_to_download.is_empty() {
            // All segments already complete
            self.cancelled.store(true, Ordering::Release);
            let _ = progress_handle.await;
            return Ok(());
        }
        
        // Main retry loop
        loop {
            if segments_to_download.is_empty() {
                break;
            }
            
            let mut join_set = JoinSet::new();
            
            // Use final_url if available (after redirects), otherwise use original url
            // This avoids re-resolving redirects for every segment request
            let url = self.effective_url().to_string();
            let (credentials, cookies) = self.site_auth_for(&url);
            
            // Spawn a worker for each segment that needs downloading
            for segment in &segments_to_download {
                let worker = SegmentWorker::new_with_credentials(
                    self.download.id,
                    segment.clone(),
                    url.clone(),
                    self.temp_dir.clone(),
                    self.client.clone(),
                    self.rate_limiter.clone(),
                    self.db.clone(),
                    self.event_tx.clone(),
                    self.paused.clone(),
                    self.cancelled.clone(),
                    self.total_downloaded.clone(),
                    credentials.clone(),
                    cookies.clone(),
                );
                
                let segment_index = segment.index;
                join_set.spawn(async move { 
                    let result = worker.run().await;
                    (segment_index, result)
                });
            }
            
            // Track failed segments for retry
            let mut failed_segments: Vec<Segment> = Vec::new();
            let mut was_paused = false;
            let mut was_cancelled = false;
            
            // Wait for all segments to complete
            while let Some(result) = join_set.join_next().await {
                match result {
                    Ok((segment_idx, Ok(segment_result))) => {
                        info!("Segment {} completed", segment_idx);
                        // Note: For multi-segment, size should already be known
                        // but if somehow discovered, we could update here
                        if segment_result.discovered_size.is_some() {
                            info!("Segment {} discovered size (unusual for multi-segment)", segment_idx);
                        }
                    }
                    Ok((segment_idx, Err(DlmanError::Paused))) => {
                        info!("Segment {} paused", segment_idx);
                        self.paused.store(true, Ordering::Release);
                        was_paused = true;
                    }
                    Ok((segment_idx, Err(DlmanError::Cancelled))) => {
                        info!("Segment {} cancelled", segment_idx);
                        self.cancelled.store(true, Ordering::Release);
                        was_cancelled = true;
                    }
                    Ok((segment_idx, Err(e))) => {
                        let retry_count = retry_counts.entry(segment_idx).or_insert(0);
                        *retry_count += 1;
                        
                        if *retry_count <= self.max_retries {
                            warn!("Segment {} failed (attempt {}/{}): {}. Will retry.", 
                                  segment_idx, retry_count, self.max_retries, e);
                            // Find the segment to retry
                            if let Some(seg) = self.download.segments.iter().find(|s| s.index == segment_idx) {
                                failed_segments.push(seg.clone());
                            }
                        } else {
                            error!("Segment {} failed after {} attempts: {}", segment_idx, self.max_retries, e);
                            self.cancelled.store(true, Ordering::Release);
                            let _ = progress_handle.await;
                            return Err(e);
                        }
                    }
                    Err(e) => {
                        error!("Segment task panicked: {}", e);
                        self.cancelled.store(true, Ordering::Release);
                        let _ = progress_handle.await;
                        return Err(DlmanError::Unknown(format!("Segment task panicked: {}", e)));
                    }
                }
            }
            
            // Check for pause/cancel
            if was_paused {
                self.cancelled.store(true, Ordering::Release);
                let _ = progress_handle.await;
                return Err(DlmanError::Paused);
            }
            
            if was_cancelled {
                self.cancelled.store(true, Ordering::Release);
                let _ = progress_handle.await;
                return Err(DlmanError::Cancelled);
            }
            
            // Prepare for retry if there are failed segments
            if !failed_segments.is_empty() {
                info!("Retrying {} failed segments after {} seconds delay...", 
                      failed_segments.len(), self.retry_delay_secs);
                tokio::time::sleep(tokio::time::Duration::from_secs(self.retry_delay_secs as u64)).await;
                
                // Check if cancelled during delay
                if self.cancelled.load(Ordering::Acquire) {
                    let _ = progress_handle.await;
                    return Err(DlmanError::Cancelled);
                }
                if self.paused.load(Ordering::Acquire) {
                    let _ = progress_handle.await;
                    return Err(DlmanError::Paused);
                }
                
                segments_to_download = failed_segments;
            } else {
                // All segments completed successfully
                segments_to_download.clear();
            }
        }
        
        // Stop progress reporter
        self.cancelled.store(true, Ordering::Release);
        let _ = progress_handle.await;
        
        Ok(())
    }
    
    /// Spawn a background task to report progress periodically
    fn spawn_progress_reporter(&self) -> tokio::task::JoinHandle<()> {
        let download_id = self.download.id;
        let total_size = self.download.size;
        let total_downloaded = self.total_downloaded.clone();
        let cancelled = self.cancelled.clone();
        let paused = self.paused.clone();
        let event_tx = self.event_tx.clone();
        let db = self.db.clone();
        
        tokio::spawn(async move {
            // Rolling speed calculation with exponential moving average
            // Use a sliding window for more stable measurements
            let mut speed_samples: Vec<f64> = Vec::with_capacity(10);
            let mut last_downloaded = total_downloaded.load(Ordering::Acquire);
            let mut last_time = std::time::Instant::now();
            let mut smoothed_speed: f64 = 0.0;
            let alpha = 0.15; // Lower alpha = smoother speed display (was 0.3)
            let mut last_db_save = std::time::Instant::now();
            
            while !cancelled.load(Ordering::Acquire) {
                // Update every 500ms for smooth UI without flooding
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                
                // Skip if paused
                if paused.load(Ordering::Acquire) {
                    last_time = std::time::Instant::now();
                    last_downloaded = total_downloaded.load(Ordering::Acquire);
                    speed_samples.clear();
                    smoothed_speed = 0.0;
                    continue;
                }
                
                let now = std::time::Instant::now();
                let downloaded = total_downloaded.load(Ordering::Acquire);
                let elapsed = now.duration_since(last_time).as_secs_f64();
                
                // Calculate instant speed
                let instant_speed = if elapsed > 0.0 {
                    (downloaded.saturating_sub(last_downloaded)) as f64 / elapsed
                } else {
                    0.0
                };
                
                // Store sample in sliding window (last 10 samples = 5 seconds)
                speed_samples.push(instant_speed);
                if speed_samples.len() > 10 {
                    speed_samples.remove(0);
                }
                
                // Use windowed average combined with EMA for stability
                let window_avg = if !speed_samples.is_empty() {
                    speed_samples.iter().sum::<f64>() / speed_samples.len() as f64
                } else {
                    instant_speed
                };
                
                // Apply exponential moving average to windowed average for smooth speed
                smoothed_speed = alpha * window_avg + (1.0 - alpha) * smoothed_speed;
                let speed = smoothed_speed as u64;
                
                // Calculate ETA
                let eta = if speed > 0 && total_size.is_some() {
                    let remaining = total_size.unwrap().saturating_sub(downloaded);
                    Some(remaining / speed)
                } else {
                    None
                };
                
                // Emit progress event
                let _ = event_tx.send(CoreEvent::DownloadProgress {
                    id: download_id,
                    downloaded,
                    total: total_size,
                    speed,
                    eta,
                });
                
                // Save to DB every 5 seconds
                if last_db_save.elapsed().as_secs() >= 5 {
                    let _ = db.update_download_progress(download_id, downloaded).await;
                    last_db_save = std::time::Instant::now();
                }
                
                last_downloaded = downloaded;
                last_time = now;
            }
        })
    }
    
    /// Probe URL to determine if range requests are supported
    /// Uses HEAD first, then falls back to partial GET for size/resumability detection
    async fn probe_url(&mut self) -> Result<bool, DlmanError> {
        let mut request = self.client.head(&self.download.url);
        
        // Apply credentials if available
        if let Some((ref username, ref password)) = self.credentials {
            request = request.basic_auth(username, Some(password));
        }
        
        // Apply browser cookies if available (session-based auth)
        if let Some(ref cookies) = self.download.cookies {
            request = request.header(reqwest::header::COOKIE, cookies);
        }
        
        let response = request.send().await?;
        
        // Check for authentication required
        let status = response.status();
        if status.as_u16() == 401 || status.as_u16() == 403 {
            let domain = url::Url::parse(&self.download.url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.to_string()))
                .unwrap_or_else(|| "unknown".to_string());
            
            return Err(DlmanError::AuthenticationRequired {
                domain,
                url: self.download.url.clone(),
                status: status.as_u16(),
            });
        }
        
        let mut supports_range = response
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .and_then(|v| v.to_str().ok())
            .map(|s| s == "bytes")
            .unwrap_or(false);
        
        // Update size if we don't have it
        if self.download.size.is_none() {
            self.download.size = response
                .headers()
                .get(reqwest::header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok());
        }
        
        // Update final URL if redirected
        let final_url = response.url().to_string();
        if final_url != self.download.url {
            self.download.final_url = Some(final_url.clone());
        }
        
        // If HEAD didn't give us size, try a partial GET request
        // This is critical for GitHub releases and similar CDNs
        if self.download.size.is_none() {
            let probe_url = self.download.final_url.as_ref().unwrap_or(&self.download.url);
            info!("HEAD didn't return Content-Length, trying partial GET on {}", probe_url);
            
            let mut range_req = self.client
                .get(probe_url)
                .header(reqwest::header::RANGE, "bytes=0-0");
            
            // Apply credentials and cookies to the fallback probe too
            let (credentials, cookies) = self.site_auth_for(probe_url);
            if let Some((ref username, ref password)) = credentials {
                range_req = range_req.basic_auth(username, Some(password));
            }
            if let Some(ref cookies) = cookies {
                range_req = range_req.header(reqwest::header::COOKIE, cookies);
            }
            
            match range_req.send().await
            {
                Ok(range_response) => {
                    let status = range_response.status();
                    info!("Partial GET status: {}", status);
                    
                    // Check for 206 Partial Content - means range is supported
                    if status == reqwest::StatusCode::PARTIAL_CONTENT {
                        supports_range = true;
                        
                        // Parse Content-Range header for total size: "bytes 0-0/12345"
                        if let Some(content_range) = range_response.headers().get(reqwest::header::CONTENT_RANGE) {
                            if let Ok(range_str) = content_range.to_str() {
                                info!("Content-Range: {}", range_str);
                                if let Some(total) = range_str.split('/').last() {
                                    if total != "*" { // "*" means unknown size
                                        if let Ok(total_size) = total.parse::<u64>() {
                                            self.download.size = Some(total_size);
                                            info!("Got size from Content-Range: {} bytes", total_size);
                                        }
                                    }
                                }
                            }
                        }
                    } else if status == reqwest::StatusCode::OK {
                        // Server ignored range and sent full content - get size from Content-Length
                        if let Some(size) = range_response.headers()
                            .get(reqwest::header::CONTENT_LENGTH)
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse().ok())
                        {
                            self.download.size = Some(size);
                            info!("Got size from full GET response: {} bytes", size);
                        }
                        // Range not supported, we'll do single-segment
                        supports_range = false;
                    }
                }
                Err(e) => {
                    warn!("Partial GET probe failed: {} - continuing without size info", e);
                }
            }
        }
        
        Ok(supports_range)
    }
    
    /// Calculate segments for multi-segment download
    fn calculate_segments(&self, num_segments: usize) -> Vec<Segment> {
        let total_size = self.download.size.unwrap_or(0);
        
        if num_segments <= 1 || total_size < 1024 * 1024 {
            return vec![Segment {
                index: 0,
                start: 0,
                end: total_size.saturating_sub(1),
                downloaded: 0,
                complete: false,
            }];
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
            
            segments.push(Segment {
                index: i as u32,
                start,
                end,
                downloaded: 0,
                complete: false,
            });
        }
        
        segments
    }
    
    /// Merge all segment temp files into the final file
    /// Returns a vector of actual sizes for each segment (useful for unknown-size downloads)
    async fn merge_segments(&self) -> Result<Vec<u64>, DlmanError> {
        let final_path = self.download.destination.join(&self.download.filename);
        
        info!("Merging {} segments into {:?}", self.download.segments.len(), final_path);
        
        // First, verify all temp files exist and collect their sizes
        let mut segment_sizes: Vec<u64> = Vec::with_capacity(self.download.segments.len());
        for segment in &self.download.segments {
            let temp_path = self.temp_dir.join(format!(
                "{}_segment_{}.part",
                self.download.id, segment.index
            ));
            
            if !temp_path.exists() {
                error!("Segment temp file missing: {:?} - download corrupted", temp_path);
                return Err(DlmanError::Unknown(format!(
                    "Segment {} temp file missing - download may be corrupted. Delete and restart.",
                    segment.index
                )));
            }
            
            // Get actual file size
            let metadata = tokio::fs::metadata(&temp_path).await?;
            let file_size = metadata.len();
            segment_sizes.push(file_size);
            
            info!("Segment {} temp file verified: {:?} (size: {} bytes)", segment.index, temp_path, file_size);
        }
        
        // Ensure destination directory exists
        if let Err(e) = tokio::fs::create_dir_all(&self.download.destination).await {
            error!("Failed to create destination directory {:?}: {}", self.download.destination, e);
            return Err(DlmanError::Io(e));
        }
        
        // Create or truncate final file
        info!("Creating final file: {:?}", final_path);
        let mut output = match OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&final_path)
            .await {
                Ok(f) => f,
                Err(e) => {
                    error!("Failed to create final file {:?}: {}", final_path, e);
                    return Err(DlmanError::Io(e));
                }
            };
        
        // Copy each segment in order
        for segment in &self.download.segments {
            let temp_path = self.temp_dir.join(format!(
                "{}_segment_{}.part",
                self.download.id, segment.index
            ));
            
            info!("Copying segment {} from {:?}", segment.index, temp_path);
            
            // Temp file should exist (we checked above), but handle gracefully
            let mut input = match File::open(&temp_path).await {
                Ok(f) => f,
                Err(e) => {
                    error!("Failed to open temp file {:?}: {}", temp_path, e);
                    return Err(DlmanError::Io(e));
                }
            };
            let mut buffer = vec![0u8; 1024 * 1024]; // 1MB buffer
            
            loop {
                let n = match input.read(&mut buffer).await {
                    Ok(n) => n,
                    Err(e) => {
                        error!("Failed to read from temp file {:?}: {}", temp_path, e);
                        return Err(DlmanError::Io(e));
                    }
                };
                if n == 0 {
                    break;
                }
                if let Err(e) = output.write_all(&buffer[..n]).await {
                    error!("Failed to write to final file {:?}: {}", final_path, e);
                    return Err(DlmanError::Io(e));
                }
            }
            
            info!("Segment {} copied successfully", segment.index);
            
            // Delete temp file
            if let Err(e) = tokio::fs::remove_file(&temp_path).await {
                warn!("Failed to remove temp file {:?}: {}", temp_path, e);
            }
        }
        
        output.flush().await?;
        output.sync_all().await?;

        // Best-effort: remove the scratch dir now that this download's parts are
        // merged. remove_dir only succeeds if empty, so concurrent downloads
        // sharing the destination's cache are left untouched.
        let _ = tokio::fs::remove_dir(&self.temp_dir).await;

        info!("Merge complete: {:?}", final_path);
        Ok(segment_sizes)
    }
    
    /// Pause the download
    pub fn pause(&self) {
        self.paused.store(true, Ordering::Release);
        info!("Download {} paused", self.download.id);
    }
    
    /// Resume the download
    pub fn resume(&self) {
        self.paused.store(false, Ordering::Release);
        info!("Download {} resumed", self.download.id);
    }
    
    /// Cancel the download
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        info!("Download {} cancelled", self.download.id);
    }
    
    /// Check if paused
    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Acquire)
    }
    
    /// Check if cancelled
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(mode: &str, custom: Option<&str>) -> TempStorageSettings {
        TempStorageSettings {
            mode: mode.to_string(),
            custom_path: custom.map(PathBuf::from),
        }
    }

    #[test]
    fn destination_mode_uses_hidden_dir_beside_file() {
        let dir = resolve_segment_cache_dir(
            &policy("destination", None),
            Path::new("/mnt/usb/Movies"),
            Path::new("/home/u/.local/share/dlman"),
            Some(10),
        );
        assert_eq!(dir, PathBuf::from("/mnt/usb/Movies/.dlman-cache"));
    }

    #[test]
    fn appdata_mode_uses_system_temp() {
        let dir = resolve_segment_cache_dir(
            &policy("appdata", None),
            Path::new("/mnt/usb/Movies"),
            Path::new("/home/u/.local/share/dlman"),
            Some(10),
        );
        assert_eq!(dir, PathBuf::from("/home/u/.local/share/dlman/temp"));
    }

    #[test]
    fn custom_mode_uses_chosen_dir_but_falls_back_when_empty() {
        let dir = resolve_segment_cache_dir(
            &policy("custom", Some("/fast/ssd/scratch")),
            Path::new("/mnt/usb/Movies"),
            Path::new("/home/u/.local/share/dlman"),
            None,
        );
        assert_eq!(dir, PathBuf::from("/fast/ssd/scratch"));

        let fallback = resolve_segment_cache_dir(
            &policy("custom", None),
            Path::new("/mnt/usb/Movies"),
            Path::new("/home/u/.local/share/dlman"),
            None,
        );
        assert_eq!(fallback, PathBuf::from("/home/u/.local/share/dlman/temp"));
    }

    #[test]
    fn auto_uses_appdata_when_size_unknown() {
        // Unknown size is treated as "fits" → fast system-disk scratch.
        let dir = resolve_segment_cache_dir(
            &policy("auto", None),
            Path::new("/mnt/usb/Movies"),
            Path::new("/home/u/.local/share/dlman"),
            None,
        );
        assert_eq!(dir, PathBuf::from("/home/u/.local/share/dlman/temp"));
    }

    #[test]
    fn unknown_mode_is_treated_as_auto() {
        let dir = resolve_segment_cache_dir(
            &policy("something-else", None),
            Path::new("/mnt/usb/Movies"),
            Path::new("/home/u/.local/share/dlman"),
            None,
        );
        assert_eq!(dir, PathBuf::from("/home/u/.local/share/dlman/temp"));
    }

    #[test]
    fn candidate_dirs_cover_destination_appdata_and_custom() {
        let dirs = candidate_cache_dirs(
            &policy("custom", Some("/fast/ssd/scratch")),
            Path::new("/mnt/usb/Movies"),
            Path::new("/home/u/.local/share/dlman"),
        );
        assert!(dirs.contains(&PathBuf::from("/mnt/usb/Movies/.dlman-cache")));
        assert!(dirs.contains(&PathBuf::from("/home/u/.local/share/dlman/temp")));
        assert!(dirs.contains(&PathBuf::from("/fast/ssd/scratch")));
    }
}
