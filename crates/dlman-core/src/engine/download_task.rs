//! Download task - coordinates multiple segment workers
//!
//! This is the main orchestrator for a single download.
//! It spawns segment workers, monitors their progress, and merges temp files on completion.

use crate::engine::{DownloadDatabase, RateLimiter, SegmentWorker};
use crate::error::DlmanError;
use dlman_types::{CoreEvent, Download, DownloadStatus, Segment};
use reqwest::Client;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::broadcast;
use tokio::task::JoinSet;
use tracing::{error, info, warn};

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
}

impl DownloadTask {
    /// Create a new download task
    pub fn new(
        download: Download,
        temp_dir: PathBuf,
        client: Client,
        rate_limiter: RateLimiter,
        db: DownloadDatabase,
        event_tx: broadcast::Sender<CoreEvent>,
        paused: Arc<AtomicBool>,
        cancelled: Arc<AtomicBool>,
    ) -> Self {
        let total_downloaded = Arc::new(AtomicU64::new(download.downloaded));
        
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
        info!("Starting download task for {}: {}", self.download.id, self.download.filename);
        
        // Update status to downloading
        self.download.status = DownloadStatus::Downloading;
        self.db.update_download_status(self.download.id, DownloadStatus::Downloading, None).await?;
        self.emit_status_change(DownloadStatus::Downloading, None).await;
        
        // If no segments, probe URL and initialize them
        if self.download.segments.is_empty() {
            info!("No segments found, initializing...");
            let supports_range = self.probe_url().await?;
            
            if supports_range && self.download.size.unwrap_or(0) > 1024 * 1024 {
                // Multi-segment download
                let num_segments = 4; // TODO: Make configurable
                self.download.segments = self.calculate_segments(num_segments);
                info!("Initialized {} segments", num_segments);
            } else {
                // Single segment download
                let size = self.download.size.unwrap_or(u64::MAX);
                self.download.segments = vec![Segment {
                    index: 0,
                    start: 0,
                    end: if size == u64::MAX { u64::MAX } else { size - 1 },
                    downloaded: 0,
                    complete: false,
                }];
                info!("Initialized single segment (no range support or small file)");
            }
            
            // Save segments to DB
            self.db.upsert_download(&self.download).await?;
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
        self.merge_segments().await?;
        
        // Update status to completed
        self.download.status = DownloadStatus::Completed;
        self.download.downloaded = self.download.size.unwrap_or(0);
        self.db.update_download_status(self.download.id, DownloadStatus::Completed, None).await?;
        self.emit_status_change(DownloadStatus::Completed, None).await;
        
        info!("Download completed: {}", self.download.filename);
        Ok(())
    }
    
    /// Download with a single segment
    async fn download_single_segment(&self) -> Result<(), DlmanError> {
        let segment = self.download.segments[0].clone();
        
        // Check if already complete
        if segment.complete {
            return Ok(());
        }
        
        let worker = SegmentWorker::new(
            self.download.id,
            segment,
            self.download.url.clone(),
            self.temp_dir.clone(),
            self.client.clone(),
            self.rate_limiter.clone(),
            self.db.clone(),
            self.event_tx.clone(),
            self.paused.clone(),
            self.cancelled.clone(),
            self.total_downloaded.clone(),
        );
        
        // Start progress reporter
        let progress_handle = self.spawn_progress_reporter();
        
        // Run segment worker
        let result = worker.run().await;
        
        // Stop progress reporter
        self.cancelled.store(true, Ordering::Release);
        let _ = progress_handle.await;
        
        // Propagate pause/cancel errors
        result.map(|_| ())
    }
    
    /// Download with multiple parallel segments
    async fn download_multi_segment(&self) -> Result<(), DlmanError> {
        let mut join_set = JoinSet::new();
        
        // Count incomplete segments
        let incomplete_count = self.download.segments.iter().filter(|s| !s.complete).count();
        
        if incomplete_count == 0 {
            // All segments already complete
            return Ok(());
        }
        
        // Spawn a worker for each incomplete segment
        for segment in &self.download.segments {
            if !segment.complete {
                let worker = SegmentWorker::new(
                    self.download.id,
                    segment.clone(),
                    self.download.url.clone(),
                    self.temp_dir.clone(),
                    self.client.clone(),
                    self.rate_limiter.clone(),
                    self.db.clone(),
                    self.event_tx.clone(),
                    self.paused.clone(),
                    self.cancelled.clone(),
                    self.total_downloaded.clone(),
                );
                
                join_set.spawn(async move { worker.run().await });
            }
        }
        
        // Start progress reporter
        let progress_handle = self.spawn_progress_reporter();
        
        // Wait for all segments to complete
        let mut was_paused = false;
        while let Some(result) = join_set.join_next().await {
            match result {
                Ok(Ok(path)) => {
                    info!("Segment completed: {:?}", path);
                }
                Ok(Err(DlmanError::Paused)) => {
                    // One segment was paused - signal others to pause too
                    info!("Segment paused, stopping other segments");
                    self.paused.store(true, Ordering::Release);
                    was_paused = true;
                    // Don't return yet, let other segments finish their current chunk and save
                }
                Ok(Err(DlmanError::Cancelled)) => {
                    // One segment was cancelled
                    info!("Segment cancelled, stopping other segments");
                    self.cancelled.store(true, Ordering::Release);
                    // Wait for others to stop
                }
                Ok(Err(e)) => {
                    error!("Segment failed: {}", e);
                    // Cancel all other segments on error
                    self.cancelled.store(true, Ordering::Release);
                    // Stop progress reporter and return error
                    let _ = progress_handle.await;
                    return Err(e);
                }
                Err(e) => {
                    error!("Segment task panicked: {}", e);
                    self.cancelled.store(true, Ordering::Release);
                    let _ = progress_handle.await;
                    return Err(DlmanError::Unknown(format!("Segment task panicked: {}", e)));
                }
            }
        }
        
        // Stop progress reporter
        self.cancelled.store(true, Ordering::Release);
        let _ = progress_handle.await;
        
        // Return appropriate result
        if was_paused {
            return Err(DlmanError::Paused);
        }
        
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
            let mut last_downloaded = total_downloaded.load(Ordering::Acquire);
            let mut last_time = std::time::Instant::now();
            let mut smoothed_speed: f64 = 0.0;
            let alpha = 0.3; // Smoothing factor (0-1, lower = smoother)
            let mut last_db_save = std::time::Instant::now();
            
            while !cancelled.load(Ordering::Acquire) {
                // Update every 500ms for smooth UI without flooding
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                
                // Skip if paused
                if paused.load(Ordering::Acquire) {
                    last_time = std::time::Instant::now();
                    last_downloaded = total_downloaded.load(Ordering::Acquire);
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
                
                // Apply exponential moving average for smooth speed
                smoothed_speed = alpha * instant_speed + (1.0 - alpha) * smoothed_speed;
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
    async fn probe_url(&mut self) -> Result<bool, DlmanError> {
        let response = self.client.head(&self.download.url).send().await?;
        
        let supports_range = response
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
            self.download.final_url = Some(final_url);
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
    async fn merge_segments(&self) -> Result<(), DlmanError> {
        let final_path = self.download.destination.join(&self.download.filename);
        
        info!("Merging {} segments into {:?}", self.download.segments.len(), final_path);
        
        // First, verify all temp files exist
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
        }
        
        // Create or truncate final file
        let mut output = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&final_path)
            .await?;
        
        // Copy each segment in order
        for segment in &self.download.segments {
            let temp_path = self.temp_dir.join(format!(
                "{}_segment_{}.part",
                self.download.id, segment.index
            ));
            
            // Temp file should exist (we checked above), but handle gracefully
            let mut input = File::open(&temp_path).await?;
            let mut buffer = vec![0u8; 1024 * 1024]; // 1MB buffer
            
            loop {
                let n = input.read(&mut buffer).await?;
                if n == 0 {
                    break;
                }
                output.write_all(&buffer[..n]).await?;
            }
            
            // Delete temp file
            if let Err(e) = tokio::fs::remove_file(&temp_path).await {
                warn!("Failed to remove temp file {:?}: {}", temp_path, e);
            }
        }
        
        output.flush().await?;
        output.sync_all().await?;
        
        info!("Merge complete: {:?}", final_path);
        Ok(())
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
