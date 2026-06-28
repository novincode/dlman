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
use tracing::{info, debug};
use uuid::Uuid;

/// User-Agent string used for all HTTP requests (shared constant).
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Check if a URL points to an HLS/DASH streaming manifest.
pub fn is_streaming_url(url: &str) -> bool {
    let path = url.split('?').next().unwrap_or(url).to_lowercase();
    path.ends_with(".m3u8") || path.contains(".m3u8/")
        || path.ends_with(".mpd") || path.contains(".mpd/")
}

/// Handle for an active HLS/DASH download task.
/// Holds an abort handle so we can forcefully kill ALL in-flight HTTP requests.
struct HlsTaskHandle {
    /// Set to true to signal the task should stop.
    cancel: Arc<AtomicBool>,
    /// Abort handle for the management tokio task. Calling abort() immediately
    /// cancels ALL child futures, including in-flight HTTP requests.
    abort_handle: tokio::task::AbortHandle,
}

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
    /// Active HLS/DASH download tasks (keyed by download UUID).
    /// Used for pause/cancel — abort_handle kills all in-flight segment requests.
    hls_tasks: Arc<RwLock<HashMap<Uuid, HlsTaskHandle>>>,
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
        debug!("Loaded settings: default_segments={}", settings.default_segments);
        
        // Restore downloads from database (resets Downloading → Paused for crash recovery)
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
            hls_tasks: Arc::new(RwLock::new(HashMap::new())),
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
    
    /// Add a new download.
    ///
    /// When `auto_start` is true the download begins immediately.
    /// When false, it stays in `Queued` status until the user manually starts it.
    /// Streaming URLs (m3u8/mpd) are transparently redirected to the HLS/DASH pipeline.
    pub async fn add_download(
        &self,
        url: &str,
        destination: PathBuf,
        queue_id: Uuid,
        category_id: Option<Uuid>,
        cookies: Option<String>,
        auto_start: bool,
    ) -> Result<Download, DlmanError> {
        // Safety net: redirect streaming URLs to the HLS/DASH pipeline.
        if is_streaming_url(url) {
            info!("[add_download] Intercepted streaming URL → HLS pipeline");
            return self.download_hls_stream(url, None, None, None, cookies, None, auto_start).await;
        }

        // Validate URL
        let parsed_url = url::Url::parse(url)
            .map_err(|_| DlmanError::InvalidUrl(url.to_string()))?;

        // Extract filename from URL path
        let filename = parsed_url.path_segments()
            .and_then(|s| s.last())
            .filter(|s| !s.is_empty())
            .unwrap_or("download")
            .to_string();
        let filename = urlencoding::decode(&filename)
            .map(|s| s.into_owned())
            .unwrap_or(filename);

        let unique_filename = Self::get_unique_filename(&destination, &filename, self.download_manager.db()).await;

        let mut download = Download::new(url.to_string(), destination, queue_id);
        download.category_id = category_id;
        download.filename = unique_filename;
        download.size = None;
        download.final_url = None;
        download.status = DownloadStatus::Queued;
        download.cookies = cookies;

        self.download_manager.db().upsert_download(&download).await?;
        self.emit(CoreEvent::DownloadAdded { download: download.clone() });

        if auto_start {
            let core = self.clone();
            let id = download.id;
            tokio::spawn(async move {
                if let Err(e) = core.resume_download(id).await {
                    tracing::warn!("Failed to auto-start download: {}", e);
                }
            });
        }

        Ok(download)
    }

    /// Convenience alias — adds a download without starting it.
    pub async fn add_download_queued(
        &self,
        url: &str,
        destination: PathBuf,
        queue_id: Uuid,
        category_id: Option<Uuid>,
        cookies: Option<String>,
    ) -> Result<Download, DlmanError> {
        self.add_download(url, destination, queue_id, category_id, cookies, false).await
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
        // Check if this is an active HLS streaming download
        if let Some(task) = self.hls_tasks.write().await.remove(&id) {
            // 1. Signal the cancel flag (cooperative)
            task.cancel.store(true, Ordering::Release);
            // 2. Abort the tokio task — forcefully kills ALL in-flight HTTP requests
            task.abort_handle.abort();
            info!("Paused HLS download {} — aborted all segment tasks", id);
            // 3. Update DB status
            self.download_manager.db().update_download_status(id, DownloadStatus::Paused, None).await?;
            self.emit(CoreEvent::DownloadStatusChanged {
                id,
                status: DownloadStatus::Paused,
                error: None,
            });
            return Ok(());
        }
        // Not an active HLS task — might be a paused HLS download or regular download.
        if let Ok(dl) = self.get_download(id).await {
            if is_streaming_url(&dl.url) {
                // Already paused or no active task — just ensure DB is Paused
                self.download_manager.db().update_download_status(id, DownloadStatus::Paused, None).await?;
                self.emit(CoreEvent::DownloadStatusChanged {
                    id,
                    status: DownloadStatus::Paused,
                    error: None,
                });
                return Ok(());
            }
        }
        // Regular download — delegate to manager
        self.download_manager.pause(id).await?;
        Ok(())
    }
    
    /// Resume a download
    pub async fn resume_download(&self, id: Uuid) -> Result<(), DlmanError> {
        let download = self.get_download(id).await?;

        // ── Streaming URL guard ─────────────────────────────────────────
        if is_streaming_url(&download.url) {
            if self.hls_tasks.read().await.contains_key(&id) {
                debug!("[resume] HLS {} already active, skipping", id);
                return Ok(());
            }

            info!("[resume] Routing streaming download to HLS pipeline");
            let _dl = self.download_hls_stream_with_id(
                Some(id),
                &download.url,
                None,
                Some(download.filename.clone()),
                None, // page_title lost on resume, but filename is already set
                download.cookies.clone(),
                None,
                true, // auto_start: resume always starts immediately
            ).await?;
            return Ok(());
        }
        // ── End streaming guard ─────────────────────────────────────────
        
        // Get queue for speed limit lookup
        let queue = self.queue_manager.get_queue(download.queue_id).await;
        let effective_speed_limit = download.speed_limit
            .or_else(|| queue.as_ref().and_then(|q| q.speed_limit));

        let settings = self.settings.read().await;
        let segment_count = if !download.segments.is_empty() {
            download.segments.len() as u32
        } else {
            settings.default_segments
        };
        let max_retries = settings.max_retries;
        let retry_delay_secs = settings.retry_delay_seconds;
        drop(settings);

        debug!(
            "[resume] id={} speed={:?} segments={} retries={}",
            id, effective_speed_limit, segment_count, max_retries
        );
        
        // Look up saved credentials for this URL
        let credentials = self.find_credentials_for_download(&download.url).await;
        
        // Note: manager.resume() already emits DownloadStatusChanged event
        self.download_manager.resume(id, effective_speed_limit, segment_count, max_retries, retry_delay_secs, credentials).await?;
        
        Ok(())
    }
    
    /// Cancel a download (works for both regular and HLS/DASH downloads)
    pub async fn cancel_download(&self, id: Uuid) -> Result<(), DlmanError> {
        // Check if there's an active HLS task — abort it forcefully
        if let Some(task) = self.hls_tasks.write().await.remove(&id) {
            task.cancel.store(true, Ordering::Release);
            task.abort_handle.abort();
            info!("Cancelled HLS download {} — aborted all segment tasks", id);
            self.download_manager.db().update_download_status(id, DownloadStatus::Cancelled, None).await?;
            self.emit(CoreEvent::DownloadStatusChanged {
                id,
                status: DownloadStatus::Cancelled,
                error: None,
            });
            return Ok(());
        }

        // No active task — might be paused. Check if it's a streaming URL.
        if let Ok(dl) = self.get_download(id).await {
            if is_streaming_url(&dl.url) {
                self.download_manager.db().update_download_status(id, DownloadStatus::Cancelled, None).await?;
                self.emit(CoreEvent::DownloadStatusChanged {
                    id,
                    status: DownloadStatus::Cancelled,
                    error: None,
                });
                return Ok(());
            }
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
        if is_streaming_url(&download.url) {
            info!("[retry] Routing streaming download to HLS pipeline");
            let _dl = self.download_hls_stream_with_id(
                Some(id),
                &download.url,
                None,
                Some(download.filename.clone()),
                None,
                download.cookies.clone(),
                None,
                true, // auto_start: retries always start immediately
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
    
    /// Update settings (saves to SQLite)
    pub async fn update_settings(&self, settings: Settings) -> Result<(), DlmanError> {
        debug!("Updating settings: default_segments={}", settings.default_segments);
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
    /// When `auto_start` is true, downloading begins immediately.
    /// When false, the record is created in `Queued` status and no segment work starts.
    pub async fn download_hls_stream(
        &self,
        master_url: &str,
        variant_index: Option<usize>,
        filename: Option<String>,
        page_title: Option<String>,
        cookies: Option<String>,
        referrer: Option<String>,
        auto_start: bool,
    ) -> Result<Download, DlmanError> {
        self.download_hls_stream_with_id(None, master_url, variant_index, filename, page_title, cookies, referrer, auto_start).await
    }

    /// Core HLS/DASH download implementation.
    ///
    /// When `reuse_id` is `Some(uuid)`, the existing download record is reused
    /// (for resume/retry). When `None`, a new record is created.
    /// When `auto_start` is false, returns after creating the record with
    /// `Queued` status — no segments are downloaded.
    async fn download_hls_stream_with_id(
        &self,
        reuse_id: Option<Uuid>,
        master_url: &str,
        variant_index: Option<usize>,
        filename: Option<String>,
        page_title: Option<String>,
        cookies: Option<String>,
        referrer: Option<String>,
        auto_start: bool,
    ) -> Result<Download, DlmanError> {
        use crate::media::MediaResolver;
        use dlman_types::MediaProtocol;

        // Filter out manifest-like filenames — they're not meaningful names.
        // The extension often sends the manifest filename ("master.m3u8") which is useless.
        // Also filter old bad filenames like "master.ts" from DB records.
        let filename = filename.and_then(|f| {
            let lower = f.to_lowercase();
            let stem = lower
                .trim_end_matches(".ts")
                .trim_end_matches(".mp4")
                .trim_end_matches(".m3u8")
                .trim_end_matches(".mpd");
            if lower.ends_with(".m3u8") || lower.ends_with(".mpd")
                || stem == "master" || stem == "index" || stem == "playlist"
                || stem == "video" || stem.is_empty()
            {
                None
            } else {
                Some(f)
            }
        });

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
            .user_agent(USER_AGENT)
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
            "[HLS] {} variants, chose: {}",
            variants.len(),
            chosen.label,
        );

        // 3. Get segment URLs for the chosen variant
        let segment_urls = resolver.get_segments(&detected, chosen).await?;

        if segment_urls.is_empty() {
            return Err(DlmanError::InvalidOperation(
                "No segments found in HLS media playlist".to_string(),
            ));
        }

        info!("[HLS] {} segments to download", segment_urls.len());

        // 4. Determine output filename — prefer provided filename > page_title > URL-derived
        // Build a quality suffix from the chosen variant label (e.g. " [720p]")
        let quality_suffix = if !chosen.label.is_empty()
            && chosen.label.to_lowercase() != "default"
            && chosen.label.to_lowercase() != "unknown"
        {
            format!(" [{}]", chosen.label)
        } else {
            String::new()
        };

        let out_filename = filename.unwrap_or_else(|| {
            if let Some(ref title) = page_title {
                // Sanitize page title: remove illegal filename characters
                let sanitized: String = title
                    .chars()
                    .map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c })
                    .collect();
                let sanitized = sanitized.trim().to_string();
                if !sanitized.is_empty() && sanitized.len() <= 200 {
                    return format!("{}{}.ts", sanitized, quality_suffix);
                }
            }
            // Fallback: derive a meaningful name from the URL path
            // e.g. https://cdn.example.com/hls/.../720P_4000K_12345.mp4/master.m3u8
            //   → walk backwards through path segments to find something meaningful
            if let Ok(u) = url::Url::parse(master_url) {
                if let Some(segments) = u.path_segments() {
                    let parts: Vec<&str> = segments.collect();
                    // Walk backwards: skip manifest names like "master.m3u8", "index.m3u8"
                    for &seg in parts.iter().rev() {
                        let lower = seg.to_lowercase();
                        if lower.ends_with(".m3u8") || lower.ends_with(".mpd")
                            || lower == "hls" || lower == "dash" || seg.is_empty()
                        {
                            continue;
                        }
                        // Found a non-manifest segment — use it
                        let name = seg.to_string();
                        if name.ends_with(".mp4") || name.ends_with(".ts") {
                            return name;
                        }
                        return format!("{}.ts", name);
                    }
                }
            }
            "video.ts".to_string()
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

        // 6. Reuse existing download record, or create a new one
        let initial_status = if auto_start { DownloadStatus::Downloading } else { DownloadStatus::Queued };

        let (download, unique_filename) = if let Some(existing_id) = reuse_id {
            // Resume/retry: reuse the existing download record
            match self.download_manager.db().load_download(existing_id).await {
                Ok(Some(mut dl)) => {
                    // If the existing filename is a bad manifest-derived name,
                    // upgrade it to the newly computed good filename.
                    let fname_lower = dl.filename.to_lowercase();
                    let fname_stem = fname_lower
                        .trim_end_matches(".ts")
                        .trim_end_matches(".mp4");
                    if fname_stem == "master" || fname_stem == "index"
                        || fname_stem == "playlist" || fname_stem == "video"
                    {
                        info!("[HLS] Upgrading bad filename '{}' → '{}'", dl.filename, out_filename);
                        dl.filename = out_filename.clone();
                    }
                    let fname = dl.filename.clone();
                    dl.status = initial_status;
                    dl.error = None;
                    dl.downloaded = 0;
                    self.download_manager.db().upsert_download(&dl).await?;
                    self.emit(CoreEvent::DownloadStatusChanged {
                        id: dl.id,
                        status: initial_status,
                        error: None,
                    });
                    (dl, fname)
                }
                _ => {
                    let unique_filename =
                        Self::get_unique_filename(&destination, &out_filename, self.download_manager.db()).await;
                    let mut download = Download::new(master_url.to_string(), destination.clone(), Uuid::nil());
                    download.filename = unique_filename.clone();
                    download.status = initial_status;
                    download.cookies = cookies.clone();
                    download.size = None;
                    download.downloaded = 0;
                    self.download_manager.db().upsert_download(&download).await?;
                    self.emit(CoreEvent::DownloadAdded { download: download.clone() });
                    self.emit(CoreEvent::DownloadStatusChanged {
                        id: download.id,
                        status: initial_status,
                        error: None,
                    });
                    (download, unique_filename.clone())
                }
            }
        } else {
            // Fresh download — create new record
            let unique_filename =
                Self::get_unique_filename(&destination, &out_filename, self.download_manager.db()).await;
            let mut download = Download::new(master_url.to_string(), destination.clone(), Uuid::nil());
            download.filename = unique_filename.clone();
            download.status = initial_status;
            download.cookies = cookies.clone();
            download.size = None;
            download.downloaded = 0;
            self.download_manager.db().upsert_download(&download).await?;
            self.emit(CoreEvent::DownloadAdded { download: download.clone() });
            self.emit(CoreEvent::DownloadStatusChanged {
                id: download.id,
                status: initial_status,
                error: None,
            });
            (download, unique_filename.clone())
        };

        // If user chose "Download Later", record is saved. Don't start segment work.
        if !auto_start {
            return Ok(download);
        }

        let download_id = download.id;
        let out_path = destination.join(&unique_filename);

        // 7. Create a cancel token and register the task handle
        let cancel_token = Arc::new(AtomicBool::new(false));

        // 8. Spawn the management task and register its abort handle
        let core = self.clone();
        let cookies_clone = cookies.clone();
        let referrer_clone = referrer.clone();
        let cancel_for_task = cancel_token.clone();

        let join_handle = tokio::spawn(async move {
            let result = Self::download_hls_segments(
                &core,
                download_id,
                &http_client,
                &segment_urls,
                &out_path,
                cookies_clone.as_deref(),
                referrer_clone.as_deref(),
                &cancel_for_task,
            )
            .await;

            // Task is done — remove ourselves from hls_tasks
            core.hls_tasks.write().await.remove(&download_id);

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

        // Store the task handle with its abort handle for pause/cancel
        self.hls_tasks.write().await.insert(download_id, HlsTaskHandle {
            cancel: cancel_token,
            abort_handle: join_handle.abort_handle(),
        });

        Ok(download)
    }

    /// Internal: download HLS segments concurrently and merge into a single file.
    ///
    /// Architecture (2026 best practice):
    /// - Uses `Semaphore` to limit concurrency to MAX_CONCURRENT
    /// - Segments are fed one at a time into `tokio::spawn` only when a
    ///   permit is available. The cancel token is checked BEFORE each spawn.
    /// - When pause/cancel calls `abort_handle.abort()`, all in-flight HTTP
    ///   requests are instantly dropped (including bytes().await).
    /// - Already-downloaded segments in temp_dir are kept for resume.
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
            "[HLS] Starting segment download: {} segments, {} parallel, to {}",
            total_segments, MAX_CONCURRENT, out_path.display()
        );

        // Create temp directory for individual segment files
        let temp_dir = out_path.parent().unwrap_or(std::path::Path::new("."))
            .join(format!(".dlman_hls_{}", download_id));
        tokio::fs::create_dir_all(&temp_dir).await?;

        // Shared progress counters
        let downloaded_bytes = Arc::new(AtomicU64::new(0));
        let completed_segments = Arc::new(AtomicU64::new(0));
        let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT));
        let failed = Arc::new(AtomicBool::new(false));

        // Use JoinSet so abort_all() kills every in-flight task instantly
        let mut join_set = tokio::task::JoinSet::new();

        // Feed segments into the JoinSet. The semaphore limits how many run at once.
        // We acquire the permit HERE (on the feeder) so that we block before spawning
        // more tasks than MAX_CONCURRENT, and we check cancel between each spawn.
        for (i, seg_url) in segment_urls.iter().enumerate() {
            // Check cancel BEFORE acquiring permit / spawning
            if cancel_token.load(Ordering::Acquire) {
                info!("[HLS] Cancel detected before segment {}, aborting remaining", i + 1);
                join_set.abort_all();
                return Err(DlmanError::InvalidOperation("Download cancelled/paused by user".into()));
            }

            // Skip segments already downloaded in a previous attempt
            let seg_path = temp_dir.join(format!("seg_{:06}.ts", i));
            if seg_path.exists() {
                // Count the existing file towards progress
                if let Ok(meta) = tokio::fs::metadata(&seg_path).await {
                    let len = meta.len();
                    downloaded_bytes.fetch_add(len, Ordering::Relaxed);
                    completed_segments.fetch_add(1, Ordering::Relaxed);
                }
                continue;
            }

            // If another segment permanently failed, stop spawning
            if failed.load(Ordering::Acquire) {
                break;
            }

            // Acquire permit — blocks until a slot opens up
            let permit = semaphore.clone().acquire_owned().await.map_err(|_| {
                DlmanError::InvalidOperation("Semaphore closed".into())
            })?;

            let client = client.clone();
            let seg_url = seg_url.clone();
            let seg_path_clone = seg_path.clone();
            let bytes_counter = downloaded_bytes.clone();
            let seg_counter = completed_segments.clone();
            let core_clone = core.clone();
            let cookies_owned = cookies.map(|s| s.to_string());
            let referrer_owned = referrer.map(|s| s.to_string());
            let failed_flag = failed.clone();

            join_set.spawn(async move {
                let _permit = permit; // held until this task finishes

                let mut last_err = None;
                for attempt in 0..MAX_RETRIES {
                    let mut req = client.get(&seg_url);
                    if let Some(ref c) = cookies_owned {
                        req = req.header("Cookie", c.as_str());
                    }
                    if let Some(ref r) = referrer_owned {
                        req = req.header("Referer", r.as_str());
                    }

                    match req.send().await {
                        Ok(resp) if resp.status().is_success() => {
                            match resp.bytes().await {
                                Ok(bytes) => {
                                    let len = bytes.len() as u64;
                                    if let Err(e) = tokio::fs::write(&seg_path_clone, &bytes).await {
                                        last_err = Some(format!("write error: {}", e));
                                        continue;
                                    }

                                    // Update progress
                                    let prev = bytes_counter.fetch_add(len, Ordering::Relaxed);
                                    let done = seg_counter.fetch_add(1, Ordering::Relaxed) + 1;
                                    let total_dl = prev + len;
                                    let elapsed = start.elapsed().as_secs_f64().max(0.01);
                                    let speed = (total_dl as f64 / elapsed) as u64;
                                    let avg_size = total_dl / done;
                                    let est_total = avg_size * total_segments as u64;
                                    let remaining = est_total.saturating_sub(total_dl);
                                    let eta = if speed > 0 { Some(remaining / speed) } else { None };

                                    core_clone.emit(CoreEvent::DownloadProgress {
                                        id: download_id,
                                        downloaded: total_dl,
                                        total: Some(est_total),
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

                                    return Ok((i, len));
                                }
                                Err(e) => { last_err = Some(format!("body error: {}", e)); }
                            }
                        }
                        Ok(resp) => {
                            let status = resp.status().as_u16();
                            last_err = Some(format!("HTTP {} for segment {}/{}", status, i + 1, total_segments));
                        }
                        Err(e) => { last_err = Some(format!("network error: {}", e)); }
                    }

                    // Backoff before retry
                    if attempt < MAX_RETRIES - 1 {
                        let delay = std::time::Duration::from_millis(500 * (1 << attempt));
                        tracing::warn!(
                            "[HLS] Segment {}/{} attempt {} failed, retrying in {:?}",
                            i + 1, total_segments, attempt + 1, delay
                        );
                        tokio::time::sleep(delay).await;
                    }
                }

                // Permanent failure for this segment
                failed_flag.store(true, Ordering::Release);
                Err(DlmanError::Unknown(
                    last_err.unwrap_or_else(|| format!("Segment {} failed after {} retries", i + 1, MAX_RETRIES))
                ))
            });
        }

        // Drain all completed tasks
        let mut first_error: Option<DlmanError> = None;
        while let Some(result) = join_set.join_next().await {
            match result {
                Ok(Ok(_)) => {}
                Ok(Err(e)) => {
                    tracing::error!("[HLS] Segment failed: {}", e);
                    if first_error.is_none() {
                        first_error = Some(e);
                    }
                }
                Err(join_err) if join_err.is_cancelled() => {
                    // Task was aborted by pause/cancel — expected
                }
                Err(join_err) => {
                    tracing::error!("[HLS] Task panicked: {}", join_err);
                    if first_error.is_none() {
                        first_error = Some(DlmanError::Unknown(format!("Task panicked: {}", join_err)));
                    }
                }
            }
        }

        if let Some(err) = first_error {
            // DON'T clean up temp directory on failure — segments are kept for resume
            return Err(err);
        }

        // Verify all segments exist
        for i in 0..total_segments {
            let seg_path = temp_dir.join(format!("seg_{:06}.ts", i));
            if !seg_path.exists() {
                let _ = tokio::fs::remove_dir_all(&temp_dir).await;
                return Err(DlmanError::InvalidOperation(format!(
                    "Missing segment {} after download", i + 1
                )));
            }
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

        // Clean up temp directory (segments successfully merged)
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
