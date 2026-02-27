//! DLMan Core - Robust Download Engine
//!
//! This crate provides a production-ready download manager with:
//! - Multi-segment parallel downloads (IDM-style)
//! - SQLite-based atomic persistence
//! - Token bucket rate limiting
//! - Crash-safe resume
//! - Clean pause/cancel/resume
//!
//! Architecture:
//! - Database-first (all state in SQLite)
//! - Segment workers write to temp files
//! - Temp files merged on completion
//! - Rate limiter shared across all downloads

mod engine;
mod error;
pub mod media;
mod queue;
mod scheduler;
mod storage;

pub use engine::*;
pub use error::*;
pub use queue::*;
pub use scheduler::*;
pub use storage::*;

use dlman_types::{CoreEvent, Download, DownloadStatus, LinkInfo, Queue, QueueOptions, Settings, SiteCredential};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{broadcast, RwLock};
use tracing::info;
use uuid::Uuid;

/// The main DLMan core instance
#[derive(Clone)]
pub struct DlmanCore {
    /// Download manager (handles all download logic) - public for advanced access
    pub download_manager: Arc<DownloadManager>,
    /// Queue manager
    queue_manager: Arc<QueueManager>,
    /// Queue scheduler (runs background task for timed starts/stops)
    scheduler: Arc<QueueScheduler>,
    /// Legacy storage for queues (JSON files) - settings moved to SQLite
    storage: Arc<Storage>,
    /// Application settings (cached from SQLite)
    settings: Arc<RwLock<Settings>>,
    /// Event broadcaster
    event_tx: broadcast::Sender<CoreEvent>,
    /// Cancel tokens for HLS/DASH streaming downloads (keyed by download UUID).
    /// When set to true, the segment download loop will stop.
    hls_cancel_tokens: Arc<RwLock<HashMap<Uuid, Arc<AtomicBool>>>>,
}

impl DlmanCore {
    /// Create a new DlmanCore instance
    pub async fn new(data_dir: PathBuf) -> Result<Self, DlmanError> {
        // Create event channel
        let (event_tx, _) = broadcast::channel(1000);
        
        // Initialize storage (for queues only - settings now in SQLite)
        let storage = Storage::new(data_dir.clone()).await?;
        
        // Initialize download manager (includes SQLite DB)
        let download_manager = Arc::new(DownloadManager::new(data_dir.clone(), event_tx.clone()).await?);
        
        // Load settings from SQLite database (single source of truth)
        let settings = download_manager.db().load_settings().await?;
        info!("Loaded settings from SQLite: default_segments={}", settings.default_segments);
        
        // Restore downloads from database
        let downloads = download_manager.restore_downloads().await?;
        info!("Restored {} downloads from database", downloads.len());
        
        // Initialize queue manager
        let queues = storage.load_queues().await?;
        let queue_manager = Arc::new(QueueManager::new(queues, event_tx.clone()));
        
        // Initialize scheduler
        let scheduler = Arc::new(QueueScheduler::new(queue_manager.clone(), event_tx.clone()));
        
        let core = Self {
            download_manager,
            queue_manager,
            scheduler,
            storage: Arc::new(storage),
            settings: Arc::new(RwLock::new(settings)),
            event_tx,
            hls_cancel_tokens: Arc::new(RwLock::new(HashMap::new())),
        };
        
        // Start the scheduler background task
        core.scheduler.start(core.clone()).await;
        
        // Start the queue auto-advance listener
        // This watches for download completions/failures and starts the next queued downloads
        core.start_queue_advance_listener();
        
        Ok(core)
    }
    
    /// Subscribe to core events
    pub fn subscribe(&self) -> broadcast::Receiver<CoreEvent> {
        self.event_tx.subscribe()
    }
    
    /// Emit an event
    pub fn emit(&self, event: CoreEvent) {
        let _ = self.event_tx.send(event);
    }
    
    /// Start a background listener that auto-advances queues when downloads complete/fail/cancel
    fn start_queue_advance_listener(&self) {
        let mut rx = self.event_tx.subscribe();
        let core = self.clone();
        
        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(CoreEvent::DownloadStatusChanged { id, status, .. }) => {
                        // When a download completes, fails, or is cancelled, try to start next in queue
                        if matches!(status, DownloadStatus::Completed | DownloadStatus::Failed | DownloadStatus::Cancelled) {
                            // Look up the download's queue
                            if let Ok(Some(download)) = core.download_manager.db().load_download(id).await {
                                let queue_id = download.queue_id;
                                info!("Download {} finished with status {:?}, checking queue {} for next downloads", 
                                      id, status, queue_id);
                                if let Err(e) = core.queue_manager.try_start_next_downloads(core.clone(), queue_id).await {
                                    tracing::warn!("Failed to auto-advance queue {}: {}", queue_id, e);
                                }
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("Queue advance listener lagged by {} messages", n);
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        info!("Event channel closed, stopping queue advance listener");
                        break;
                    }
                    _ => {} // Ignore other events
                }
            }
        });
    }
    
    // ========================================================================
    // Download Operations
    // ========================================================================
    
    /// Get a unique filename in the destination directory
    /// If file exists or another download is using it, appends (1), (2), etc. until unique
    async fn get_unique_filename(destination: &PathBuf, filename: &str, db: &DownloadDatabase) -> String {
        // Get all existing downloads in this destination
        let existing_downloads = db.load_all_downloads().await.unwrap_or_default();
        let existing_filenames: std::collections::HashSet<String> = existing_downloads
            .into_iter()
            .filter(|d| d.destination == *destination)
            .map(|d| d.filename)
            .collect();
        
        let full_path = destination.join(filename);
        if !full_path.exists() && !existing_filenames.contains(filename) {
            return filename.to_string();
        }
        
        // Split filename into stem and extension
        let path = std::path::Path::new(filename);
        let stem = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(filename);
        let extension = path.extension()
            .and_then(|s| s.to_str());
        
        // Try incrementing numbers until we find a unique name
        for i in 1..1000 {
            let new_filename = match extension {
                Some(ext) => format!("{} ({}).{}", stem, i, ext),
                None => format!("{} ({})", stem, i),
            };
            let new_path = destination.join(&new_filename);
            if !new_path.exists() && !existing_filenames.contains(&new_filename) {
                return new_filename;
            }
        }
        
        // Fallback: add UUID suffix
        let uuid_suffix = Uuid::new_v4().to_string().split('-').next().unwrap_or("").to_string();
        match extension {
            Some(ext) => format!("{}_{}.{}", stem, uuid_suffix, ext),
            None => format!("{}_{}", stem, uuid_suffix),
        }
    }
    
    /// Add a new download
    /// 
    /// This is NON-BLOCKING - the download is immediately added to the queue
    /// and returned. URL probing happens lazily when the download actually starts.
    pub async fn add_download(
        &self,
        url: &str,
        destination: PathBuf,
        queue_id: Uuid,
        category_id: Option<Uuid>,
        cookies: Option<String>,
    ) -> Result<Download, DlmanError> {
        // Safety net: detect streaming URLs at the core level.
        // If an m3u8/mpd URL reaches here (despite higher-level detection),
        // redirect to the HLS/DASH pipeline instead of downloading as a file.
        let url_path = url.split('?').next().unwrap_or(url).to_lowercase();
        if url_path.ends_with(".m3u8") || url_path.contains(".m3u8/") ||
           url_path.ends_with(".mpd") || url_path.contains(".mpd/") {
            info!("[core::add_download] Intercepted streaming URL, redirecting to HLS pipeline: {}", url);
            return self.download_hls_stream(url, None, None, None, cookies, None).await;
        }

        // Validate URL
        let parsed_url = url::Url::parse(url)
            .map_err(|_| DlmanError::InvalidUrl(url.to_string()))?;
        
        // Extract filename from URL without making network request
        // The actual metadata (size, resumable) will be fetched when download starts
        let filename = parsed_url.path_segments()
            .and_then(|s| s.last())
            .filter(|s| !s.is_empty())
            .unwrap_or("download")
            .to_string();
        
        // URL decode the filename
        let filename = urlencoding::decode(&filename)
            .map(|s| s.into_owned())
            .unwrap_or(filename);
        
        // Get unique filename to avoid overwriting existing files or conflicting with in-progress downloads
        let unique_filename = Self::get_unique_filename(&destination, &filename, self.download_manager.db()).await;
        
        // Create download - size and final_url will be set when download starts
        let mut download = Download::new(url.to_string(), destination, queue_id);
        download.category_id = category_id;
        download.filename = unique_filename;
        download.size = None; // Will be set when download starts
        download.final_url = None; // Will be set when download starts
        download.status = DownloadStatus::Queued;
        download.cookies = cookies;
        
        // Note: download.speed_limit stays None - the queue's speed_limit will be used at runtime
        // This way if queue settings change, downloads will use the new limit
        // User can explicitly set speed_limit on a download to override
        
        // Save to database
        self.download_manager.db().upsert_download(&download).await?;
        
        // Emit event immediately so UI updates
        self.emit(CoreEvent::DownloadAdded {
            download: download.clone(),
        });
        
        // Start the download immediately (non-blocking)
        // We directly resume the download rather than using try_start_next_download
        // because the queue might not be "running"
        let core_clone = self.clone();
        let download_id = download.id;
        tokio::spawn(async move {
            if let Err(e) = core_clone.resume_download(download_id).await {
                tracing::warn!("Failed to auto-start download: {}", e);
            }
        });
        
        Ok(download)
    }
    
    /// Add a new download without auto-starting (queued status)
    /// 
    /// This adds the download to the queue but does NOT start it automatically.
    /// The download will remain in "Queued" status until manually started.
    pub async fn add_download_queued(
        &self,
        url: &str,
        destination: PathBuf,
        queue_id: Uuid,
        category_id: Option<Uuid>,
        cookies: Option<String>,
    ) -> Result<Download, DlmanError> {
        // Safety net: streaming URLs should never be queued as regular downloads
        let url_path = url.split('?').next().unwrap_or(url).to_lowercase();
        if url_path.ends_with(".m3u8") || url_path.contains(".m3u8/") ||
           url_path.ends_with(".mpd") || url_path.contains(".mpd/") {
            info!("[core::add_download_queued] Intercepted streaming URL, redirecting to HLS pipeline: {}", url);
            return self.download_hls_stream(url, None, None, None, cookies, None).await;
        }

        // Validate URL
        let parsed_url = url::Url::parse(url)
            .map_err(|_| DlmanError::InvalidUrl(url.to_string()))?;
        
        // Extract filename from URL without making network request
        let filename = parsed_url.path_segments()
            .and_then(|s| s.last())
            .filter(|s| !s.is_empty())
            .unwrap_or("download")
            .to_string();
        
        // URL decode the filename
        let filename = urlencoding::decode(&filename)
            .map(|s| s.into_owned())
            .unwrap_or(filename);
        
        // Get unique filename
        let unique_filename = Self::get_unique_filename(&destination, &filename, self.download_manager.db()).await;
        
        // Create download with Queued status (not Pending)
        let mut download = Download::new(url.to_string(), destination, queue_id);
        download.category_id = category_id;
        download.filename = unique_filename;
        download.size = None;
        download.final_url = None;
        download.status = DownloadStatus::Queued; // Stay queued, don't auto-start
        download.cookies = cookies;
        
        // Save to database
        self.download_manager.db().upsert_download(&download).await?;
        
        // Emit event immediately so UI updates
        self.emit(CoreEvent::DownloadAdded {
            download: download.clone(),
        });
        
        // NOTE: We do NOT spawn the try_start_next_download here
        // The download stays in queue until user manually starts it
        
        Ok(download)
    }
    
    /// Get a download by ID
    pub async fn get_download(&self, id: Uuid) -> Result<Download, DlmanError> {
        self.download_manager.db().load_download(id).await?
            .ok_or(DlmanError::NotFound(id))
    }
    
    /// Get all downloads
    pub async fn get_all_downloads(&self) -> Result<Vec<Download>, DlmanError> {
        self.download_manager.db().load_all_downloads().await
    }
    
    /// Pause a download (works for both regular and HLS/DASH downloads)
    pub async fn pause_download(&self, id: Uuid) -> Result<(), DlmanError> {
        // Check if this is an HLS streaming download — signal its cancel token
        if let Some(token) = self.hls_cancel_tokens.read().await.get(&id) {
            token.store(true, Ordering::Release);
            info!("Signaled cancel for HLS download {}", id);
            // Update DB status
            self.download_manager.db().update_download_status(id, DownloadStatus::Paused, None).await?;
            self.emit(CoreEvent::DownloadStatusChanged {
                id,
                status: DownloadStatus::Paused,
                error: None,
            });
            return Ok(());
        }
        // Regular download — delegate to manager
        self.download_manager.pause(id).await?;
        Ok(())
    }
    
    /// Resume a download
    pub async fn resume_download(&self, id: Uuid) -> Result<(), DlmanError> {
        let download = self.get_download(id).await?;

        // ── Streaming URL guard ─────────────────────────────────────────
        // If the URL is an HLS/DASH manifest, it MUST go through the
        // streaming pipeline — not the regular segment downloader.
        // This is the single choke-point that all resume paths
        // (manual resume, queue auto-start, scheduler) funnel through.
        let url_path = download.url.split('?').next().unwrap_or(&download.url).to_lowercase();
        if url_path.ends_with(".m3u8") || url_path.contains(".m3u8/") ||
           url_path.ends_with(".mpd") || url_path.contains(".mpd/") {
            info!("[resume_download] Detected streaming URL, routing to HLS/DASH pipeline: {}", &download.url);
            // Re-run the full streaming pipeline (resolves variants, downloads segments, merges)
            let _dl = self.download_hls_stream(
                &download.url,
                None,               // variant_index — pick best
                Some(download.filename.clone()),
                None,               // page_title  
                download.cookies.clone(),
                None,               // referrer
            ).await?;
            return Ok(());
        }
        // ────────────────────────────────────────────────────────────────
        
        // Get queue for speed limit lookup
        let queue = self.queue_manager.get_queue(download.queue_id).await;
        
        info!(
            "resume_download: id={}, download.speed_limit={:?}, queue.speed_limit={:?}",
            id,
            download.speed_limit,
            queue.as_ref().and_then(|q| q.speed_limit)
        );
        
        // Calculate effective speed limit: download override > queue limit > unlimited
        let effective_speed_limit = if let Some(limit) = download.speed_limit {
            Some(limit)
        } else {
            // Download has no override, check queue
            queue.as_ref().and_then(|q| q.speed_limit)
        };
        
        // Get segment count: existing segments > app settings (queue segment_count removed)
        let settings_segment_count = self.settings.read().await.default_segments;
        info!("resume_download: settings.default_segments={}", settings_segment_count);
        
        let segment_count = if !download.segments.is_empty() {
            // Download already has segments, use existing count
            info!("resume_download: using existing segment count from download");
            download.segments.len() as u32
        } else {
            // Use app settings
            info!("resume_download: using settings default_segments={}", settings_segment_count);
            settings_segment_count
        };
        
        // Get retry settings from app settings
        let settings = self.settings.read().await;
        let max_retries = settings.max_retries;
        let retry_delay_secs = settings.retry_delay_seconds;
        drop(settings);
        
        info!("resume_download: effective_speed_limit={:?}, segment_count={}, max_retries={}", 
              effective_speed_limit, segment_count, max_retries);
        
        // Look up saved credentials for this URL
        let credentials = self.find_credentials_for_download(&download.url).await;
        
        // Note: manager.resume() already emits DownloadStatusChanged event
        self.download_manager.resume(id, effective_speed_limit, segment_count, max_retries, retry_delay_secs, credentials).await?;
        
        Ok(())
    }
    
    /// Cancel a download (works for both regular and HLS/DASH downloads)
    pub async fn cancel_download(&self, id: Uuid) -> Result<(), DlmanError> {
        // Check if this is an HLS streaming download — signal its cancel token
        if let Some(token) = self.hls_cancel_tokens.write().await.remove(&id) {
            token.store(true, Ordering::Release);
            info!("Cancelled HLS download {}", id);
            self.download_manager.db().update_download_status(id, DownloadStatus::Cancelled, None).await?;
            self.emit(CoreEvent::DownloadStatusChanged {
                id,
                status: DownloadStatus::Cancelled,
                error: None,
            });
            return Ok(());
        }
        // Regular download — delegate to manager
        self.download_manager.cancel(id).await?;
        Ok(())
    }
    
    /// Retry a failed download
    /// This continues from existing progress when possible, rather than starting over
    pub async fn retry_download(&self, id: Uuid) -> Result<(), DlmanError> {
        let mut download = self.get_download(id).await?;

        // ── Streaming URL guard ─────────────────────────────────────────
        let url_path = download.url.split('?').next().unwrap_or(&download.url).to_lowercase();
        if url_path.ends_with(".m3u8") || url_path.contains(".m3u8/") ||
           url_path.ends_with(".mpd") || url_path.contains(".mpd/") {
            info!("[retry_download] Detected streaming URL, routing to HLS/DASH pipeline: {}", &download.url);
            let _dl = self.download_hls_stream(
                &download.url,
                None,
                Some(download.filename.clone()),
                None,
                download.cookies.clone(),
                None,
            ).await?;
            return Ok(());
        }
        // ────────────────────────────────────────────────────────────────
        
        // Check if we can resume from existing segments
        let has_usable_segments = !download.segments.is_empty() 
            && download.segments.iter().any(|s| s.downloaded > 0);
        
        if has_usable_segments {
            // Continue from existing progress - just reset status and error
            info!("Retrying download {} with existing segments ({})", id, download.segments.len());
            download.status = DownloadStatus::Queued;
            download.error = None;
            download.retry_count += 1;
            // Keep segments and downloaded bytes intact!
        } else {
            // No usable segments, start fresh
            info!("Retrying download {} from scratch (no existing progress)", id);
            download.status = DownloadStatus::Queued;
            download.downloaded = 0;
            download.error = None;
            download.retry_count += 1;
            download.segments.clear();
        }
        
        // Save to DB
        self.download_manager.db().upsert_download(&download).await?;
        
        // Emit update event
        self.emit(CoreEvent::DownloadUpdated {
            download: download.clone(),
        });
        
        // Immediately start the download instead of relying on queue logic
        let settings = self.settings.read().await;
        let effective_limit = download.speed_limit;
        let segment_count = if download.segments.is_empty() {
            settings.default_segments
        } else {
            download.segments.len() as u32
        };
        let max_retries = settings.max_retries;
        let retry_delay = settings.retry_delay_seconds;
        drop(settings);
        
        // Start immediately
        let credentials = self.find_credentials_for_download(&download.url).await;
        self.download_manager.start(
            download,
            effective_limit,
            segment_count,
            max_retries,
            retry_delay,
            credentials,
        ).await?;
        
        Ok(())
    }
    
    /// Delete a download
    pub async fn delete_download(&self, id: Uuid, delete_file: bool) -> Result<(), DlmanError> {
        self.download_manager.delete(id, delete_file).await
    }
    
    /// Update download speed limit
    /// `speed_limit` - None means use queue limit, Some(0) is treated as unlimited, Some(x) is x bytes/sec
    pub async fn update_download_speed_limit(
        &self,
        id: Uuid,
        speed_limit: Option<u64>,
    ) -> Result<(), DlmanError> {
        // Get download to find its queue
        let download = self.get_download(id).await?;
        
        // Calculate effective limit for active downloads:
        // - If speed_limit is Some(value), use that value
        // - If speed_limit is None, use queue's speed limit (or unlimited if queue has none)
        let effective_limit = if speed_limit.is_some() {
            speed_limit
        } else {
            self.queue_manager.get_queue(download.queue_id).await
                .and_then(|q| q.speed_limit)
        };
        
        // The manager stores the raw speed_limit but uses effective_limit for active downloads
        self.download_manager.update_speed_limit_with_effective(id, speed_limit, effective_limit).await
    }
    
    /// Update download status (internal)
    pub async fn update_download_status(
        &self,
        id: Uuid,
        status: DownloadStatus,
        error: Option<String>,
    ) -> Result<(), DlmanError> {
        self.download_manager.db().update_download_status(id, status, error.clone()).await?;
        self.emit(CoreEvent::DownloadStatusChanged { id, status, error });
        Ok(())
    }
    
    // ========================================================================
    // Queue Operations
    // ========================================================================
    
    /// Get all queues
    pub async fn get_queues(&self) -> Vec<Queue> {
        self.queue_manager.get_all_queues().await
    }
    
    /// Create a new queue
    pub async fn create_queue(&self, name: &str, options: QueueOptions) -> Result<Queue, DlmanError> {
        let queue = self.queue_manager.create_queue(name, options).await?;
        self.storage.save_queue(&queue).await?;
        Ok(queue)
    }
    
    /// Update a queue
    pub async fn update_queue(&self, id: Uuid, options: QueueOptions) -> Result<Queue, DlmanError> {
        let queue = self.queue_manager.update_queue(id, options).await?;
        self.storage.save_queue(&queue).await?;
        
        // Update speed limits for all active downloads in this queue that use queue limit
        let downloads = self.download_manager.db().get_downloads_by_queue(id).await?;
        for download in &downloads {
            // Only update if download has no override (uses queue limit)
            if download.speed_limit.is_none() && self.download_manager.is_active(download.id).await {
                // Update the effective limit for this active download
                let effective_limit = queue.speed_limit;
                self.download_manager.update_speed_limit_with_effective(
                    download.id, 
                    None,  // Keep the download's stored value as None
                    effective_limit,
                ).await?;
            }
        }
        
        // If the queue is running, try to fill any newly available slots
        // (e.g., user increased max_concurrent from 2 to 4)
        if self.queue_manager.is_running(id).await {
            if let Err(e) = self.queue_manager.try_start_next_downloads(self.clone(), id).await {
                tracing::warn!("Failed to auto-advance queue after update: {}", e);
            }
        }
        
        Ok(queue)
    }
    
    /// Delete a queue
    pub async fn delete_queue(&self, id: Uuid) -> Result<(), DlmanError> {
        // Don't allow deleting default queue
        if id == Uuid::nil() {
            return Err(DlmanError::InvalidOperation(
                "Cannot delete default queue".to_string(),
            ));
        }
        
        // Move downloads to default queue
        let downloads = self.download_manager.db().get_downloads_by_queue(id).await?;
        for mut download in downloads {
            download.queue_id = Uuid::nil();
            self.download_manager.db().upsert_download(&download).await?;
        }
        
        // Delete queue
        self.queue_manager.delete_queue(id).await?;
        self.storage.delete_queue(id).await?;
        
        Ok(())
    }
    
    /// Start a queue
    pub async fn start_queue(&self, id: Uuid) -> Result<(), DlmanError> {
        self.queue_manager.start_queue(self.clone(), id).await
    }
    
    /// Stop a queue
    pub async fn stop_queue(&self, id: Uuid) -> Result<(), DlmanError> {
        self.queue_manager.stop_queue(id).await?;
        
        // Pause all downloads in this queue
        let downloads = self.download_manager.db().get_downloads_by_queue(id).await?;
        for download in downloads {
            if download.status == DownloadStatus::Downloading {
                self.pause_download(download.id).await?;
            }
        }
        
        Ok(())
    }
    
    /// Get time until next scheduled start for a queue (in seconds)
    pub fn get_time_until_next_start(&self, queue: &Queue) -> Option<u64> {
        time_until_next_start(queue).map(|d| d.as_secs())
    }
    
    // ========================================================================
    // Bulk Operations
    // ========================================================================
    
    /// Probe multiple URLs
    pub async fn probe_links(&self, urls: Vec<String>) -> Vec<LinkInfo> {
        let mut results = Vec::new();
        
        for url in urls {
            let info = match url::Url::parse(&url) {
                Ok(parsed) => self.download_manager.probe_url(&parsed).await.unwrap_or_else(|e| LinkInfo {
                    url: url.clone(),
                    final_url: None,
                    filename: "unknown".to_string(),
                    size: None,
                    content_type: None,
                    resumable: false,
                    requires_auth: false,
                    error: Some(e.to_string()),
                }),
                Err(_) => LinkInfo {
                    url: url.clone(),
                    final_url: None,
                    filename: "unknown".to_string(),
                    size: None,
                    content_type: None,
                    resumable: false,
                    requires_auth: false,
                    error: Some("Invalid URL".to_string()),
                },
            };
            results.push(info);
        }
        
        results
    }
    
    /// Move downloads to a different queue
    pub async fn move_downloads(&self, ids: Vec<Uuid>, queue_id: Uuid) -> Result<(), DlmanError> {
        // Verify queue exists
        if self.queue_manager.get_queue(queue_id).await.is_none() {
            return Err(DlmanError::NotFound(queue_id));
        }
        
        // Get new queue speed limit
        let new_queue_limit = self.queue_manager.get_queue(queue_id).await
            .and_then(|q| q.speed_limit);
        
        // Update downloads
        for id in ids {
            let mut download = self.get_download(id).await?;
            download.queue_id = queue_id;
            // Clear the download's speed limit override so it uses the new queue's limit
            download.speed_limit = None;
            self.download_manager.db().upsert_download(&download).await?;
            
            // Update speed limit if download is active
            if self.download_manager.is_active(id).await {
                self.download_manager.update_speed_limit_with_effective(
                    id,
                    None,  // Use queue limit
                    new_queue_limit,
                ).await?;
            }
        }
        
        Ok(())
    }
    
    /// Pause all downloads
    pub async fn pause_all_downloads(&self) -> Result<(), DlmanError> {
        self.download_manager.pause_all().await
    }
    
    // ========================================================================
    // Credentials
    // ========================================================================
    
    /// Get all saved site credentials
    pub async fn get_all_credentials(&self) -> Result<Vec<SiteCredential>, DlmanError> {
        self.download_manager.db().load_all_credentials().await
    }
    
    /// Get a single credential by ID
    pub async fn get_credential(&self, id: Uuid) -> Result<SiteCredential, DlmanError> {
        self.download_manager.db().load_credential(id).await?
            .ok_or(DlmanError::NotFound(id))
    }
    
    /// Add or update a credential
    pub async fn upsert_credential(&self, credential: SiteCredential) -> Result<SiteCredential, DlmanError> {
        self.download_manager.db().upsert_credential(&credential).await?;
        Ok(credential)
    }
    
    /// Delete a credential
    pub async fn delete_credential(&self, id: Uuid) -> Result<(), DlmanError> {
        self.download_manager.db().delete_credential(id).await
    }
    
    /// Find matching credentials for a download URL and return (username, password) if found
    async fn find_credentials_for_download(&self, url: &str) -> Option<(String, String)> {
        match self.download_manager.db().find_credentials_for_url(url).await {
            Ok(creds) => {
                if let Some(cred) = creds.first() {
                    // Touch last_used_at in background
                    let db = self.download_manager.db().clone();
                    let cred_id = cred.id;
                    tokio::spawn(async move {
                        let _ = db.touch_credential(cred_id).await;
                    });
                    Some((cred.username.clone(), cred.password.clone()))
                } else {
                    None
                }
            }
            Err(e) => {
                tracing::warn!("Failed to look up credentials for URL: {}", e);
                None
            }
        }
    }
    
    // ========================================================================
    // Settings
    // ========================================================================
    
    /// Get settings
    pub async fn get_settings(&self) -> Settings {
        self.settings.read().await.clone()
    }
    
    /// Update settings (saves to SQLite - single source of truth)
    pub async fn update_settings(&self, settings: Settings) -> Result<(), DlmanError> {
        info!("Updating settings in SQLite: default_segments={}", settings.default_segments);
        // Save to SQLite database (single source of truth)
        self.download_manager.db().save_settings(&settings).await?;
        // Update in-memory cache
        *self.settings.write().await = settings;
        Ok(())
    }
    
    // ========================================================================
    // HLS / DASH Streaming Download
    // ========================================================================

    /// Download an HLS stream by fetching all segments and concatenating them.
    ///
    /// This creates a `Download` record in the database, fetches the m3u8
    /// playlist to discover segment URLs, downloads each segment sequentially,
    /// appends the bytes to a single output file, and reports progress via
    /// `CoreEvent::DownloadProgress`.
    ///
    /// Respects cancel tokens — pause/cancel from the UI will stop the loop.
    ///
    /// Returns the `Download` record (status = Downloading, completes async).
    pub async fn download_hls_stream(
        &self,
        master_url: &str,
        variant_index: Option<usize>,
        filename: Option<String>,
        page_title: Option<String>,
        cookies: Option<String>,
        referrer: Option<String>,
    ) -> Result<Download, DlmanError> {
        use crate::media::MediaResolver;
        use dlman_types::MediaProtocol;

        info!("========================================");
        info!("[HLS] Starting stream download");
        info!("[HLS] URL: {}", master_url);
        info!("[HLS] cookies={} referrer={} filename={:?} page_title={:?}",
            cookies.is_some(), referrer.is_some(), filename, page_title);
        info!("========================================");

        // 1. Build a DetectedMedia struct so the resolver can work
        let detected = dlman_types::DetectedMedia {
            id: Uuid::new_v4().to_string(),
            page_url: referrer.clone().unwrap_or_default(),
            page_title: page_title.clone(),
            master_url: master_url.to_string(),
            protocol: MediaProtocol::Hls,
            variants: vec![],
            mime_type: Some("application/vnd.apple.mpegurl".to_string()),
            filename: filename.clone(),
            duration: None,
            thumbnail: None,
            cookies: cookies.clone(),
            referrer: referrer.clone(),
        };

        // 2. Resolve variants from the m3u8
        let http_client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_default();
        let resolver = MediaResolver::new(http_client.clone());
        let variants = resolver.resolve(&detected).await?;

        if variants.is_empty() {
            return Err(DlmanError::InvalidOperation(
                "No variants found in HLS stream".to_string(),
            ));
        }

        // Pick the requested variant (or best quality = index 0)
        let chosen = if let Some(idx) = variant_index {
            variants.get(idx).unwrap_or(&variants[0])
        } else {
            &variants[0]
        };

        info!(
            "[HLS] {} variants found. Chose: {} ({})",
            variants.len(),
            chosen.label,
            chosen.url.chars().take(120).collect::<String>()
        );

        // 3. Get segment URLs for the chosen variant
        let segment_urls = resolver.get_segments(&detected, chosen).await?;

        if segment_urls.is_empty() {
            return Err(DlmanError::InvalidOperation(
                "No segments found in HLS media playlist".to_string(),
            ));
        }

        info!("[HLS] Media playlist has {} segments to download", segment_urls.len());
        if let Some(first) = segment_urls.first() {
            info!("[HLS] First segment: {}", first.chars().take(120).collect::<String>());
        }

        // 4. Determine output filename — prefer page_title for human-readable names
        let out_filename = filename.unwrap_or_else(|| {
            if let Some(ref title) = page_title {
                // Sanitize page title: remove illegal filename characters
                let sanitized: String = title
                    .chars()
                    .map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c })
                    .collect();
                let sanitized = sanitized.trim().to_string();
                if !sanitized.is_empty() && sanitized.len() <= 200 {
                    return format!("{}.ts", sanitized);
                }
            }
            // Fallback: derive from URL
            let name = url::Url::parse(master_url)
                .ok()
                .and_then(|u| {
                    u.path_segments()
                        .and_then(|s| s.last().map(|s| s.to_string()))
                })
                .unwrap_or_else(|| "video".to_string());
            if name.ends_with(".m3u8") {
                name.replace(".m3u8", ".ts")
            } else if name.contains('.') {
                name
            } else {
                format!("{}.ts", name)
            }
        });

        // Ensure .ts extension for concatenated HLS segments
        let out_filename = if !out_filename.ends_with(".ts") && !out_filename.ends_with(".mp4") {
            format!("{}.ts", out_filename.trim_end_matches(".m3u8"))
        } else {
            out_filename
        };

        // 5. Get download destination from settings
        let settings = self.get_settings().await;
        let destination = settings.default_download_path.clone();

        // Ensure directory exists
        tokio::fs::create_dir_all(&destination).await?;

        let unique_filename =
            Self::get_unique_filename(&destination, &out_filename, self.download_manager.db())
                .await;

        // 6. Create a Download record in the DB
        let mut download = Download::new(master_url.to_string(), destination.clone(), Uuid::nil());
        download.filename = unique_filename.clone();
        download.status = DownloadStatus::Downloading;
        download.cookies = cookies.clone();
        download.size = None;
        download.downloaded = 0;

        self.download_manager
            .db()
            .upsert_download(&download)
            .await?;
        self.emit(CoreEvent::DownloadAdded {
            download: download.clone(),
        });
        self.emit(CoreEvent::DownloadStatusChanged {
            id: download.id,
            status: DownloadStatus::Downloading,
            error: None,
        });

        let download_id = download.id;
        let out_path = destination.join(&unique_filename);

        // 7. Create a cancel token and register it so pause/cancel can stop this task
        let cancel_token = Arc::new(AtomicBool::new(false));
        self.hls_cancel_tokens.write().await.insert(download_id, cancel_token.clone());

        // 8. Spawn the segment download task
        let core = self.clone();
        let cookies_clone = cookies.clone();
        let referrer_clone = referrer.clone();

        tokio::spawn(async move {
            let result = Self::download_hls_segments(
                &core,
                download_id,
                &http_client,
                &segment_urls,
                &out_path,
                cookies_clone.as_deref(),
                referrer_clone.as_deref(),
                &cancel_token,
            )
            .await;

            // Remove the cancel token — task is done
            core.hls_cancel_tokens.write().await.remove(&download_id);

            match result {
                Ok(total_bytes) => {
                    info!(
                        "HLS download complete: {} ({} bytes, {} segments)",
                        out_path.display(),
                        total_bytes,
                        segment_urls.len()
                    );

                    // Try to remux .ts → .mp4 using ffmpeg (lossless, fast)
                    let final_path = Self::try_remux_to_mp4(&out_path).await
                        .unwrap_or_else(|| out_path.clone());
                    let final_filename = final_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&unique_filename)
                        .to_string();

                    // Update download record as completed
                    if let Ok(Some(mut dl)) =
                        core.download_manager.db().load_download(download_id).await
                    {
                        dl.filename = final_filename;
                        dl.size = Some(total_bytes);
                        dl.downloaded = total_bytes;
                        dl.status = DownloadStatus::Completed;
                        dl.completed_at = Some(chrono::Utc::now());
                        let _ = core.download_manager.db().upsert_download(&dl).await;
                    }

                    core.emit(CoreEvent::DownloadProgress {
                        id: download_id,
                        downloaded: total_bytes,
                        total: Some(total_bytes),
                        speed: 0,
                        eta: Some(0),
                    });
                    core.emit(CoreEvent::DownloadStatusChanged {
                        id: download_id,
                        status: DownloadStatus::Completed,
                        error: None,
                    });
                }
                Err(e) => {
                    let msg = e.to_string();
                    // Don't mark as failed if it was a user cancellation
                    if msg.contains("cancelled") || msg.contains("paused") {
                        info!("HLS download stopped by user: {}", msg);
                    } else {
                        tracing::error!("HLS download failed: {}", msg);
                        let _ = core
                            .download_manager
                            .db()
                            .update_download_status(
                                download_id,
                                DownloadStatus::Failed,
                                Some(msg.clone()),
                            )
                            .await;
                        core.emit(CoreEvent::DownloadStatusChanged {
                            id: download_id,
                            status: DownloadStatus::Failed,
                            error: Some(msg),
                        });
                    }
                }
            }
        });

        Ok(download)
    }

    /// Internal: download HLS segments **concurrently** and merge into a single file.
    ///
    /// Architecture:
    /// 1. Download segments in parallel (up to `MAX_CONCURRENT` at a time) into temp files
    /// 2. Track per-segment completion via atomic counters for accurate progress
    /// 3. Check `cancel_token` between batches so pause/cancel is responsive
    /// 4. After all segments download, concatenate ordered temp files → final output
    /// 5. Clean up temp directory
    ///
    /// This is dramatically faster than sequential downloads — typical HLS streams
    /// have 200+ tiny segments and CDNs allow parallel connections.
    async fn download_hls_segments(
        core: &DlmanCore,
        download_id: Uuid,
        client: &reqwest::Client,
        segment_urls: &[String],
        out_path: &std::path::Path,
        cookies: Option<&str>,
        referrer: Option<&str>,
        cancel_token: &AtomicBool,
    ) -> Result<u64, DlmanError> {
        use std::sync::atomic::AtomicU64;
        use std::time::Instant;
        use tokio::io::AsyncWriteExt;
        use tokio::sync::Semaphore;

        const MAX_CONCURRENT: usize = 8;
        const MAX_RETRIES: usize = 3;

        let total_segments = segment_urls.len();
        let start = Instant::now();

        info!(
            "[HLS] Starting concurrent segment download: {} segments, {} parallel, to {}",
            total_segments, MAX_CONCURRENT, out_path.display()
        );

        // Create temp directory for individual segment files
        let temp_dir = out_path.parent().unwrap_or(std::path::Path::new("."))
            .join(format!(".dlman_hls_{}", download_id));
        tokio::fs::create_dir_all(&temp_dir).await?;

        // Shared state for progress tracking
        let downloaded_bytes = Arc::new(AtomicU64::new(0));
        let completed_segments = Arc::new(AtomicU64::new(0));
        let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT));

        // Spawn concurrent download tasks for all segments
        let mut handles = Vec::with_capacity(total_segments);

        for (i, seg_url) in segment_urls.iter().enumerate() {
            let client = client.clone();
            let seg_url = seg_url.clone();
            let temp_dir = temp_dir.clone();
            let cancel = cancel_token as *const AtomicBool;
            // SAFETY: cancel_token lives for the entire duration of this function,
            // and we await all handles before returning.
            let cancel_ref = unsafe { &*cancel };
            let sem = semaphore.clone();
            let bytes_counter = downloaded_bytes.clone();
            let seg_counter = completed_segments.clone();
            let core_clone = core.clone();
            let cookies_owned = cookies.map(|s| s.to_string());
            let referrer_owned = referrer.map(|s| s.to_string());

            let handle = tokio::spawn(async move {
                // Acquire semaphore permit (limits concurrency)
                let _permit = sem.acquire().await.map_err(|_| {
                    DlmanError::InvalidOperation("Semaphore closed".to_string())
                })?;

                // Check cancel before starting
                if cancel_ref.load(Ordering::Acquire) {
                    return Err(DlmanError::InvalidOperation(
                        "Download cancelled/paused by user".to_string(),
                    ));
                }

                let seg_path = temp_dir.join(format!("seg_{:06}.ts", i));

                // Retry loop for transient failures
                let mut last_err = None;
                for attempt in 0..MAX_RETRIES {
                    if cancel_ref.load(Ordering::Acquire) {
                        return Err(DlmanError::InvalidOperation(
                            "Download cancelled/paused by user".to_string(),
                        ));
                    }

                    let mut request = client.get(&seg_url);
                    if let Some(ref c) = cookies_owned {
                        request = request.header("Cookie", c.as_str());
                    }
                    if let Some(ref r) = referrer_owned {
                        request = request.header("Referer", r.as_str());
                    }

                    match request.send().await {
                        Ok(response) if response.status().is_success() => {
                            match response.bytes().await {
                                Ok(bytes) => {
                                    let len = bytes.len() as u64;
                                    if let Err(e) = tokio::fs::write(&seg_path, &bytes).await {
                                        last_err = Some(DlmanError::Io(e));
                                        continue;
                                    }

                                    // Update progress counters
                                    let prev = bytes_counter.fetch_add(len, Ordering::Relaxed);
                                    let done = seg_counter.fetch_add(1, Ordering::Relaxed) + 1;
                                    let total_downloaded = prev + len;

                                    // Emit progress every segment
                                    let elapsed = start.elapsed().as_secs_f64().max(0.01);
                                    let speed = (total_downloaded as f64 / elapsed) as u64;
                                    let avg_size = total_downloaded / done;
                                    let estimated_total = avg_size * total_segments as u64;
                                    let remaining = estimated_total.saturating_sub(total_downloaded);
                                    let eta = if speed > 0 { Some(remaining / speed) } else { None };

                                    core_clone.emit(CoreEvent::DownloadProgress {
                                        id: download_id,
                                        downloaded: total_downloaded,
                                        total: Some(estimated_total),
                                        speed,
                                        eta,
                                    });

                                    if i < 3 || (i + 1) % 50 == 0 || i == total_segments - 1 {
                                        info!(
                                            "[HLS] Segment {}/{} done ({} bytes, {:.1} MB/s)",
                                            i + 1, total_segments, len,
                                            speed as f64 / 1_048_576.0
                                        );
                                    }

                                    return Ok(len);
                                }
                                Err(e) => {
                                    last_err = Some(DlmanError::Network(e));
                                }
                            }
                        }
                        Ok(response) => {
                            let status = response.status().as_u16();
                            last_err = Some(DlmanError::ServerError {
                                status,
                                message: format!(
                                    "Segment {}/{} HTTP {}", i + 1, total_segments, status
                                ),
                            });
                        }
                        Err(e) => {
                            last_err = Some(DlmanError::Network(e));
                        }
                    }

                    // Exponential backoff on retry
                    if attempt < MAX_RETRIES - 1 {
                        let delay = std::time::Duration::from_millis(500 * (1 << attempt));
                        tracing::warn!(
                            "[HLS] Segment {}/{} attempt {} failed, retrying in {:?}",
                            i + 1, total_segments, attempt + 1, delay
                        );
                        tokio::time::sleep(delay).await;
                    }
                }

                Err(last_err.unwrap_or_else(|| {
                    DlmanError::Unknown(format!("Segment {} failed after {} retries", i + 1, MAX_RETRIES))
                }))
            });

            handles.push(handle);
        }

        // Wait for all segment downloads, collect results
        let mut any_error: Option<DlmanError> = None;
        for (i, handle) in handles.into_iter().enumerate() {
            match handle.await {
                Ok(Ok(_)) => {}
                Ok(Err(e)) => {
                    if e.to_string().contains("cancelled") || e.to_string().contains("paused") {
                        // Cancel all remaining by setting the token
                        cancel_token.store(true, Ordering::Release);
                        any_error = Some(e);
                        break;
                    }
                    tracing::error!("[HLS] Segment {} failed: {}", i + 1, e);
                    if any_error.is_none() {
                        any_error = Some(e);
                    }
                }
                Err(join_err) => {
                    tracing::error!("[HLS] Segment {} task panicked: {}", i + 1, join_err);
                    if any_error.is_none() {
                        any_error = Some(DlmanError::Unknown(format!("Task panicked: {}", join_err)));
                    }
                }
            }

            // Update DB every 20 segments
            if (i + 1) % 20 == 0 {
                let total_dl = downloaded_bytes.load(Ordering::Relaxed);
                let done = completed_segments.load(Ordering::Relaxed);
                let avg = if done > 0 { total_dl / done } else { 0 };
                let est = avg * total_segments as u64;
                if let Ok(Some(mut dl)) = core.download_manager.db().load_download(download_id).await {
                    dl.downloaded = total_dl;
                    dl.size = Some(est);
                    let _ = core.download_manager.db().upsert_download(&dl).await;
                }
            }
        }

        if let Some(err) = any_error {
            // Clean up temp directory on failure
            let _ = tokio::fs::remove_dir_all(&temp_dir).await;
            return Err(err);
        }

        // ========== Merge phase: concatenate temp segments in order ==========
        info!("[HLS] All {} segments downloaded, merging...", total_segments);

        let mut out_file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(out_path)
            .await?;

        let mut total_bytes: u64 = 0;
        for i in 0..total_segments {
            let seg_path = temp_dir.join(format!("seg_{:06}.ts", i));
            let data = tokio::fs::read(&seg_path).await.map_err(|e| {
                DlmanError::Io(std::io::Error::new(
                    e.kind(),
                    format!("Failed to read segment {}: {}", i, e),
                ))
            })?;
            out_file.write_all(&data).await?;
            total_bytes += data.len() as u64;
        }
        out_file.flush().await?;

        // Clean up temp directory
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;

        info!(
            "[HLS] Merge complete: {} bytes, {:.1}s elapsed",
            total_bytes,
            start.elapsed().as_secs_f64()
        );

        Ok(total_bytes)
    }

    /// Try to remux a .ts file to .mp4 using ffmpeg (lossless copy, fast).
    /// Returns the .mp4 path on success, or None if ffmpeg is unavailable.
    async fn try_remux_to_mp4(ts_path: &std::path::Path) -> Option<std::path::PathBuf> {
        let mp4_path = ts_path.with_extension("mp4");
        let ts = ts_path.to_path_buf();
        let mp4 = mp4_path.clone();

        let result = tokio::process::Command::new("ffmpeg")
            .args(["-y", "-i"])
            .arg(&ts)
            .args(["-c", "copy", "-movflags", "+faststart"])
            .arg(&mp4)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await;

        match result {
            Ok(status) if status.success() => {
                info!("Remuxed to MP4: {}", mp4.display());
                // Delete the .ts source file
                let _ = tokio::fs::remove_file(&ts).await;
                Some(mp4_path)
            }
            Ok(status) => {
                tracing::warn!("ffmpeg remux failed with exit code {:?}, keeping .ts", status.code());
                None
            }
            Err(e) => {
                // ffmpeg not found or failed to execute — that's fine, keep .ts
                tracing::debug!("ffmpeg not available ({}), keeping .ts file", e);
                None
            }
        }
    }

    // ========================================================================
    // Export/Import
    // ========================================================================
    
    /// Export all data
    pub async fn export_data(&self) -> Result<String, DlmanError> {
        let downloads = self.get_all_downloads().await?;
        let queues = self.get_queues().await;
        let settings = self.get_settings().await;
        
        let data = serde_json::json!({
            "version": 2,
            "downloads": downloads,
            "queues": queues,
            "settings": settings,
        });
        
        serde_json::to_string_pretty(&data)
            .map_err(|e| DlmanError::Serialization(e.to_string()))
    }
    
    /// Import data
    pub async fn import_data(&self, json: &str) -> Result<(), DlmanError> {
        let data: serde_json::Value =
            serde_json::from_str(json)
                .map_err(|e| DlmanError::Serialization(e.to_string()))?;
        
        // Import downloads
        if let Some(downloads) = data.get("downloads").and_then(|d| d.as_array()) {
            for download_value in downloads {
                if let Ok(download) = serde_json::from_value::<Download>(download_value.clone()) {
                    self.download_manager.db().upsert_download(&download).await?;
                }
            }
        }
        
        // Import queues
        if let Some(queues) = data.get("queues").and_then(|q| q.as_array()) {
            for queue_value in queues {
                if let Ok(queue) = serde_json::from_value::<Queue>(queue_value.clone()) {
                    self.storage.save_queue(&queue).await?;
                }
            }
        }
        
        // Import settings
        if let Some(settings_value) = data.get("settings") {
            if let Ok(settings) = serde_json::from_value::<Settings>(settings_value.clone()) {
                self.update_settings(settings).await?;
            }
        }
        
        Ok(())
    }
}

// Compatibility shim for old API (moved outside impl block)
pub mod compat {
    use super::*;
    use std::collections::HashMap;
    
    /// Compatibility shim for old API
    pub async fn get_downloads_map(core: &DlmanCore) -> HashMap<Uuid, Download> {
        match core.get_all_downloads().await {
            Ok(downloads) => downloads.into_iter().map(|d| (d.id, d)).collect(),
            Err(_) => HashMap::new(),
        }
    }
}

// Re-export for backwards compatibility
pub use engine::DownloadManager;
pub use engine::DownloadDatabase;

impl std::fmt::Debug for DlmanCore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DlmanCore")
            .field("download_manager", &"DownloadManager")
            .field("queue_manager", &"QueueManager")
            .finish()
    }
}
