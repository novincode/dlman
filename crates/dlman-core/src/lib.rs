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
mod queue;
mod scheduler;
mod storage;

pub use engine::*;
pub use error::*;
pub use queue::*;
pub use scheduler::*;
pub use storage::*;

use dlman_types::{CoreEvent, Download, DownloadStatus, LinkInfo, Queue, QueueOptions, Settings, SiteCredential};
use std::path::PathBuf;
use std::sync::Arc;
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
    ) -> Result<Download, DlmanError> {
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
    ) -> Result<Download, DlmanError> {
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
    
    /// Pause a download
    pub async fn pause_download(&self, id: Uuid) -> Result<(), DlmanError> {
        // Note: manager.pause() already emits DownloadStatusChanged event
        self.download_manager.pause(id).await?;
        Ok(())
    }
    
    /// Resume a download
    pub async fn resume_download(&self, id: Uuid) -> Result<(), DlmanError> {
        let download = self.get_download(id).await?;
        
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
    
    /// Cancel a download
    pub async fn cancel_download(&self, id: Uuid) -> Result<(), DlmanError> {
        // Note: manager.cancel() already emits DownloadStatusChanged event
        self.download_manager.cancel(id).await?;
        Ok(())
    }
    
    /// Retry a failed download
    /// This continues from existing progress when possible, rather than starting over
    pub async fn retry_download(&self, id: Uuid) -> Result<(), DlmanError> {
        let mut download = self.get_download(id).await?;
        
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
                    error: Some(e.to_string()),
                }),
                Err(_) => LinkInfo {
                    url: url.clone(),
                    final_url: None,
                    filename: "unknown".to_string(),
                    size: None,
                    content_type: None,
                    resumable: false,
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
