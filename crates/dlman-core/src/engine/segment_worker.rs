//! Segment worker - downloads a single segment to a temporary file
//!
//! Each segment worker is independent and writes to its own temp file.
//! On completion, all segment files are merged into the final file.

use crate::engine::rate_limiter::RateLimiter;
use crate::engine::persistence::DownloadDatabase;
use crate::error::DlmanError;
use dlman_types::{CoreEvent, Segment};
use futures::StreamExt;
use reqwest::Client;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::fs::OpenOptions;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio::sync::broadcast;
use tracing::{debug, info};
use uuid::Uuid;

/// Result of a segment download
pub struct SegmentResult {
    /// Path to the downloaded segment file
    pub path: PathBuf,
    /// Total size discovered during download (if previously unknown)
    pub discovered_size: Option<u64>,
}

/// A segment worker that downloads a byte range to a temporary file
pub struct SegmentWorker {
    download_id: Uuid,
    segment: Segment,
    url: String,
    temp_file_path: PathBuf,
    client: Client,
    rate_limiter: RateLimiter,
    db: DownloadDatabase,
    event_tx: broadcast::Sender<CoreEvent>,
    paused: Arc<AtomicBool>,
    cancelled: Arc<AtomicBool>,
    downloaded_bytes: Arc<AtomicU64>,
}

impl SegmentWorker {
    /// Create a new segment worker
    pub fn new(
        download_id: Uuid,
        segment: Segment,
        url: String,
        temp_dir: PathBuf,
        client: Client,
        rate_limiter: RateLimiter,
        db: DownloadDatabase,
        event_tx: broadcast::Sender<CoreEvent>,
        paused: Arc<AtomicBool>,
        cancelled: Arc<AtomicBool>,
        downloaded_bytes: Arc<AtomicU64>,
    ) -> Self {
        let temp_file_path = temp_dir.join(format!(
            "{}_segment_{}.part",
            download_id, segment.index
        ));
        
        Self {
            download_id,
            segment,
            url,
            temp_file_path,
            client,
            rate_limiter,
            db,
            event_tx,
            paused,
            cancelled,
            downloaded_bytes,
        }
    }
    
    /// Run the segment download
    pub async fn run(mut self) -> Result<SegmentResult, DlmanError> {
        info!(
            "Starting segment {} for download {} (bytes {}-{})",
            self.segment.index, self.download_id, self.segment.start, self.segment.end
        );
        
        // Track if we discover the total size during download
        let mut discovered_size: Option<u64> = None;
        
        // Check if segment is already complete
        if self.segment.complete {
            info!("Segment {} already complete", self.segment.index);
            return Ok(SegmentResult {
                path: self.temp_file_path,
                discovered_size: None,
            });
        }
        
        // Open or create temp file
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .read(true)
            .open(&self.temp_file_path)
            .await?;
        
        // Check existing file size for resume
        // For unknown size segments, we always resume from whatever we have
        let existing_size = file.metadata().await?.len();
        if existing_size > 0 {
            // For unknown size, always resume; for known size, only if within bounds
            if self.segment.is_unknown_size() || existing_size <= self.segment.size() {
                self.segment.downloaded = existing_size;
                file.seek(std::io::SeekFrom::Start(existing_size)).await?;
                info!(
                    "Resuming segment {} from byte {}",
                    self.segment.index, existing_size
                );
            }
        }
        
        // Calculate actual byte range to download
        let start_byte = self.segment.start + self.segment.downloaded;
        let end_byte = self.segment.end;
        let unknown_size = end_byte == u64::MAX;
        
        // For unknown size, we don't know if we're done until the stream ends
        if !unknown_size && start_byte >= end_byte {
            // Already complete
            self.segment.complete = true;
            self.db
                .update_segment_progress(
                    self.download_id,
                    self.segment.index,
                    self.segment.downloaded,
                    true,
                )
                .await?;
            return Ok(SegmentResult {
                path: self.temp_file_path,
                discovered_size: None,
            });
        }
        
        // Build HTTP request
        // For unknown size (end = MAX), use open-ended range "bytes=N-"
        // For known size, use "bytes=N-M"
        let request = if unknown_size {
            if start_byte == 0 {
                // No resume, just download from the beginning
                self.client.get(&self.url)
            } else {
                // Resume from start_byte with open-ended range
                self.client
                    .get(&self.url)
                    .header("Range", format!("bytes={}-", start_byte))
            }
        } else {
            // Known size, use specific range
            let range_header = format!("bytes={}-{}", start_byte, end_byte);
            debug!("Segment {} requesting range: {}", self.segment.index, range_header);
            self.client.get(&self.url).header("Range", range_header)
        };
        
        let response = request.send().await?;
        
        // Check response status
        let status = response.status();
        if !status.is_success() && status.as_u16() != 206 {
            return Err(DlmanError::ServerError {
                status: status.as_u16(),
                message: format!("Failed to download segment {}", self.segment.index),
            });
        }
        
        // If we have unknown size, try to detect it from response headers
        if unknown_size {
            // Try Content-Range first (for 206 responses): "bytes 0-X/12345"
            if let Some(content_range) = response.headers().get(reqwest::header::CONTENT_RANGE) {
                if let Ok(range_str) = content_range.to_str() {
                    if let Some(total) = range_str.split('/').last() {
                        if total != "*" {
                            if let Ok(total_size) = total.parse::<u64>() {
                                info!("Got total size from Content-Range: {} bytes", total_size);
                                self.segment.end = total_size.saturating_sub(1);
                                discovered_size = Some(total_size);
                            }
                        }
                    }
                }
            }
            
            // Try Content-Length for 200 OK responses (full content)
            if self.segment.end == u64::MAX {
                if let Some(content_length) = response.headers().get(reqwest::header::CONTENT_LENGTH) {
                    if let Ok(len_str) = content_length.to_str() {
                        if let Ok(len) = len_str.parse::<u64>() {
                            // If resuming, add existing downloaded to get total
                            let total = if start_byte > 0 { start_byte + len } else { len };
                            info!("Got total size from Content-Length: {} bytes", total);
                            self.segment.end = total.saturating_sub(1);
                            discovered_size = Some(total);
                        }
                    }
                }
            }
        }
        
        // Stream and write chunks
        let mut stream = response.bytes_stream();
        let mut last_db_update = tokio::time::Instant::now();
        let mut last_event_emit = tokio::time::Instant::now();
        
        while let Some(chunk_result) = stream.next().await {
            // Check cancellation first
            if self.cancelled.load(Ordering::Acquire) {
                info!("Segment {} cancelled", self.segment.index);
                self.save_progress().await?;
                return Err(DlmanError::Cancelled);
            }
            
            // Check pause - save progress and return Paused error
            // This allows the HTTP connection to be closed and resumed later
            if self.paused.load(Ordering::Acquire) {
                info!("Segment {} paused", self.segment.index);
                self.save_progress().await?;
                return Err(DlmanError::Paused);
            }
            
            let chunk = chunk_result?;
            let chunk_len = chunk.len() as u64;
            
            // Apply rate limiting
            self.rate_limiter.acquire(chunk_len).await;
            
            // Write to temp file
            file.write_all(&chunk).await?;
            
            // Update progress atomically
            self.segment.downloaded += chunk_len;
            self.downloaded_bytes.fetch_add(chunk_len, Ordering::AcqRel);
            
            // Emit segment progress event every 300ms (throttled, not per-chunk)
            if last_event_emit.elapsed().as_millis() >= 300 {
                let _ = self.event_tx.send(CoreEvent::SegmentProgress {
                    download_id: self.download_id,
                    segment_index: self.segment.index,
                    downloaded: self.segment.downloaded,
                });
                last_event_emit = tokio::time::Instant::now();
            }
            
            // Periodically save to database (every 2 seconds)
            if last_db_update.elapsed().as_secs() >= 2 {
                self.save_progress().await?;
                last_db_update = tokio::time::Instant::now();
            }
        }
        
        // Flush and sync to disk
        file.flush().await?;
        file.sync_all().await?;
        
        // Mark segment as complete
        self.segment.complete = true;
        self.save_progress().await?;
        
        info!(
            "Segment {} complete ({} bytes)",
            self.segment.index, self.segment.downloaded
        );
        
        Ok(SegmentResult {
            path: self.temp_file_path,
            discovered_size,
        })
    }
    
    /// Save progress to database
    async fn save_progress(&self) -> Result<(), DlmanError> {
        self.db
            .update_segment_progress(
                self.download_id,
                self.segment.index,
                self.segment.downloaded,
                self.segment.complete,
            )
            .await?;
        
        Ok(())
    }
}
