//! DLMan Core - Download Engine
//!
//! This crate provides the core download functionality for DLMan.
//! It handles multi-segment downloads, pause/resume, queues, and more.

mod download;
mod error;
mod queue;
mod storage;

pub use download::*;
pub use error::*;
pub use queue::*;
pub use storage::*;

use dlman_types::{CoreEvent, Download, DownloadStatus, Queue, Settings};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::RwLock;
use tracing::{error, info};
use uuid::Uuid;

/// The main DLMan core instance
#[derive(Debug)]
pub struct DlmanCore {
    /// Active downloads
    pub downloads: Arc<RwLock<HashMap<Uuid, Download>>>,
    /// Configured queues
    pub queues: Arc<RwLock<HashMap<Uuid, Queue>>>,
    /// Application settings
    pub settings: Arc<RwLock<Settings>>,
    /// Database connection
    pub storage: Arc<Storage>,
    /// Event broadcaster
    event_tx: broadcast::Sender<CoreEvent>,
    /// Download manager
    download_manager: Arc<DownloadManager>,
    /// Queue scheduler
    queue_scheduler: Arc<QueueScheduler>,
}

impl DlmanCore {
    /// Create a new DlmanCore instance
    pub async fn new(data_dir: PathBuf) -> Result<Self, DlmanError> {
        // Initialize storage
        let storage = Storage::new(data_dir.clone()).await?;

        // Load data from storage
        let downloads = storage.load_downloads().await?;
        let queues = storage.load_queues().await?;
        let settings = storage.load_settings().await?;

        // Ensure default queue exists
        let mut queues_map: HashMap<Uuid, Queue> = queues.into_iter().map(|q| (q.id, q)).collect();
        if !queues_map.contains_key(&Uuid::nil()) {
            let default_queue = Queue::default_queue();
            queues_map.insert(Uuid::nil(), default_queue);
        }

        // Create event channel
        let (event_tx, _) = broadcast::channel(1000);

        // Create download manager
        let download_manager = Arc::new(DownloadManager::new(event_tx.clone()));

        // Create queue scheduler
        let queue_scheduler = Arc::new(QueueScheduler::new(event_tx.clone()));

        Ok(Self {
            downloads: Arc::new(RwLock::new(
                downloads.into_iter().map(|d| (d.id, d)).collect(),
            )),
            queues: Arc::new(RwLock::new(queues_map)),
            settings: Arc::new(RwLock::new(settings)),
            storage: Arc::new(storage),
            event_tx,
            download_manager,
            queue_scheduler,
        })
    }

    /// Subscribe to core events
    pub fn subscribe(&self) -> broadcast::Receiver<CoreEvent> {
        self.event_tx.subscribe()
    }

    /// Emit an event
    pub fn emit(&self, event: CoreEvent) {
        let _ = self.event_tx.send(event);
    }

    // ========================================================================
    // Download Operations
    // ========================================================================

    /// Add a new download
    pub async fn add_download(
        &self,
        url: &str,
        destination: PathBuf,
        queue_id: Uuid,
        category_id: Option<Uuid>,
    ) -> Result<Download, DlmanError> {
        // Validate URL
        let parsed_url = url::Url::parse(url).map_err(|_| DlmanError::InvalidUrl(url.to_string()))?;

        // Validate destination
        if destination.as_os_str().is_empty() {
            return Err(DlmanError::InvalidOperation("Destination path is empty".to_string()));
        }

        // Create download
        let mut download = Download::new(url.to_string(), destination, queue_id);
        download.category_id = category_id;
        let id = download.id;

        // Probe the URL for metadata
        let probed = self.download_manager.probe_url(&parsed_url).await?;

        // Update download with probed info
        let mut download = download;
        download.filename = probed.filename;
        download.size = probed.size;
        download.final_url = probed.final_url;

        // Initialize segments if the server supports range requests and file is large enough
        if probed.resumable && probed.size.map(|s| s > 1024 * 1024).unwrap_or(false) {
            let num_segments = 4; // Default to 4 segments
            download.segments = download::calculate_segments_public(probed.size.unwrap(), num_segments);
        }

        // Get queue's speed limit if the download doesn't have its own
        if download.speed_limit.is_none() {
            let queues = self.queues.read().await;
            if let Some(queue) = queues.get(&queue_id) {
                download.speed_limit = queue.speed_limit;
            }
        }

        // Set status to queued (will be started by queue manager if queue is running)
        download.status = dlman_types::DownloadStatus::Queued;

        // Save to storage
        self.storage.save_download(&download).await?;

        // Add to active downloads
        self.downloads.write().await.insert(id, download.clone());

        // Emit event
        self.emit(CoreEvent::DownloadAdded {
            download: download.clone(),
        });

        // Try to start the download if the queue has available slots
        self.try_start_download(download.clone()).await?;

        Ok(download)
    }

    /// Try to start a download if the queue has available slots
    async fn try_start_download(&self, download: Download) -> Result<(), DlmanError> {
        let queue_id = download.queue_id;
        let queues = self.queues.read().await;
        
        if let Some(queue) = queues.get(&queue_id) {
            // Check if queue is running
            if !self.queue_scheduler.is_queue_running(queue_id).await {
                return Ok(()); // Queue not running, don't start download
            }

            // Count currently downloading downloads in this queue
            let downloads = self.downloads.read().await;
            let downloading_count = downloads
                .values()
                .filter(|d| d.queue_id == queue_id && d.status == dlman_types::DownloadStatus::Downloading)
                .count();

            // If we have available slots, start the download
            if downloading_count < queue.max_concurrent as usize {
                drop(queues);
                drop(downloads);
                self.start_download(download.id).await?;
            }
        }

        Ok(())
    }

    /// Start a download (set status to Downloading and begin download)
    async fn start_download(&self, id: Uuid) -> Result<(), DlmanError> {
        // Get the download
        let download = self
            .downloads
            .read()
            .await
            .get(&id)
            .cloned()
            .ok_or(DlmanError::NotFound(id))?;

        // Update status to downloading
        self.update_download_status(id, dlman_types::DownloadStatus::Downloading, None)
            .await?;

        // Start the actual download
        self.download_manager.start(download, self.clone()).await?;

        Ok(())
    }

    /// Get a download by ID
    pub async fn get_download(&self, id: Uuid) -> Result<Download, DlmanError> {
        self.downloads
            .read()
            .await
            .get(&id)
            .cloned()
            .ok_or(DlmanError::NotFound(id))
    }

    /// Update a download in memory and storage
    pub async fn update_download(&self, download: &Download) -> Result<(), DlmanError> {
        // Update in memory
        self.downloads.write().await.insert(download.id, download.clone());

        // Save to storage
        self.storage.save_download(download).await?;

        Ok(())
    }

    /// Pause a download
    pub async fn pause_download(&self, id: Uuid) -> Result<(), DlmanError> {
        // Try to pause the download (if running)
        let _ = self.download_manager.pause(id).await;
        // Always update the status
        self.update_download_status(id, dlman_types::DownloadStatus::Paused, None)
            .await
    }

    /// Resume a download
    pub async fn resume_download(&self, id: Uuid) -> Result<(), DlmanError> {
        info!("Core: resuming download {}", id);

        // Check if download exists in core first
        let download_exists = self.downloads.read().await.contains_key(&id);
        if !download_exists {
            info!("Core: download {} not found in core, skipping resume", id);
            return Ok(()); // Don't error if download doesn't exist
        }

        match self.download_manager.resume(id, self.clone()).await {
            Ok(_) => {
                info!("Core: download manager resume successful for {}", id);
                self.update_download_status(id, dlman_types::DownloadStatus::Downloading, None)
                    .await
            }
            Err(e) => {
                error!("Core: download manager resume failed for {}: {}", id, e);
                Err(e)
            }
        }
    }

    /// Retry a failed/cancelled download by resetting it and restarting
    pub async fn retry_download(&self, id: Uuid) -> Result<(), DlmanError> {
        info!("Core: retrying download {}", id);

        // Get the download
        let mut download = self
            .downloads
            .read()
            .await
            .get(&id)
            .cloned()
            .ok_or(DlmanError::NotFound(id))?;

        // Check if it's in a retryable state (allow more states)
        if matches!(download.status, DownloadStatus::Downloading | DownloadStatus::Completed) {
            return Err(DlmanError::InvalidOperation("Download is still active or completed".to_string()));
        }

        info!("Core: resetting download {} from status {:?}", id, download.status);

        // Reset download state for fresh start
        download.downloaded = 0;
        download.status = DownloadStatus::Pending;
        download.segments.clear();
        download.error = None;
        download.retry_count += 1;

        // Re-probe the URL to get fresh metadata and re-initialize segments if needed
        if let Ok(parsed_url) = url::Url::parse(&download.url) {
            if let Ok(probed) = self.download_manager.probe_url(&parsed_url).await {
                download.filename = probed.filename;
                download.size = probed.size;
                download.final_url = probed.final_url;

                // Re-initialize segments if the server supports range requests and file is large enough
                if probed.resumable && probed.size.map(|s| s > 1024 * 1024).unwrap_or(false) {
                    let num_segments = 4; // Default to 4 segments
                    download.segments = download::calculate_segments_public(probed.size.unwrap(), num_segments);
                    info!("Core: reinitialized {} segments for download {}", download.segments.len(), id);
                } else {
                    info!("Core: download {} not eligible for segments (resumable: {}, size: {:?})", id, probed.resumable, probed.size);
                }
            } else {
                info!("Core: failed to probe URL for download {}", id);
            }
        } else {
            info!("Core: failed to parse URL for download {}", id);
        }

        // Save the reset download
        self.downloads.write().await.insert(id, download.clone());
        self.storage.save_download(&download).await?;

        // Emit update event to notify frontend of segment changes
        self.emit(CoreEvent::DownloadUpdated {
            download: download.clone(),
        });

        // Start the download fresh
        self.start_download(id).await?;

        Ok(())
    }

    /// Cancel a download
    pub async fn cancel_download(&self, id: Uuid) -> Result<(), DlmanError> {
        self.download_manager.cancel(id).await?;
        self.update_download_status(id, dlman_types::DownloadStatus::Cancelled, None)
            .await
    }


    /// Update speed limit for a download
    pub async fn update_download_speed_limit(&self, id: Uuid, speed_limit: Option<u64>) -> Result<(), DlmanError> {
        // Update the download manager (for running downloads)
        // Pass 0 for None (unlimited)
        let limit_value = speed_limit.unwrap_or(0);
        let _ = self.download_manager.update_speed_limit(id, limit_value).await;

        // Update in memory and storage
        {
            let mut downloads = self.downloads.write().await;
            if let Some(download) = downloads.get_mut(&id) {
                download.speed_limit = speed_limit;
            }
        }

        // Get updated download for saving
        let download = self.downloads.read().await.get(&id).cloned();

        // Save to storage
        if let Some(download) = download {
            self.storage.save_download(&download).await?;

            // Emit update event to notify frontend
            self.emit(CoreEvent::DownloadUpdated {
                download: download.clone(),
            });
        }

        Ok(())
    }

    /// Delete a download
    pub async fn delete_download(&self, id: Uuid, delete_file: bool) -> Result<(), DlmanError> {
        // Cancel if running
        let _ = self.download_manager.cancel(id).await;

        // Get download info
        let download = self.downloads.write().await.remove(&id);

        if let Some(download) = download {
            // Delete file if requested
            if delete_file && download.status == dlman_types::DownloadStatus::Completed {
                let file_path = download.destination.join(&download.filename);
                if file_path.exists() {
                    tokio::fs::remove_file(&file_path).await?;
                }
            }

            // Delete meta file
            let meta_path = download
                .destination
                .join(format!("{}.dlman.meta", download.filename));
            if meta_path.exists() {
                let _ = tokio::fs::remove_file(&meta_path).await;
            }
        }

        // Remove from storage
        self.storage.delete_download(id).await?;

        // Emit event
        self.emit(CoreEvent::DownloadRemoved { id });

        Ok(())
    }

    /// Update download status
    async fn update_download_status(
        &self,
        id: Uuid,
        status: dlman_types::DownloadStatus,
        error: Option<String>,
    ) -> Result<(), DlmanError> {
        // Get the download before updating to know its queue
        let download_copy = self.downloads.read().await.get(&id).cloned();

        // Update in memory
        {
            let mut downloads = self.downloads.write().await;
            if let Some(download) = downloads.get_mut(&id) {
                download.status = status;
                download.error = error.clone();
                if status == dlman_types::DownloadStatus::Completed {
                    download.completed_at = Some(chrono::Utc::now());
                    // Reset retry count on success
                    download.retry_count = 0;
                }
                // Note: retry_count is updated in the download task, not here
            }
        }

        // Save to storage
        if let Some(download) = download_copy.as_ref() {
            self.storage.save_download(download).await?;
        }

        // Emit event
        self.emit(CoreEvent::DownloadStatusChanged { id, status, error });

        Ok(())
    }

    /// Update download progress
    async fn update_download_progress(
        &self,
        id: Uuid,
        downloaded: u64,
        segments: Option<Vec<dlman_types::Segment>>,
    ) -> Result<(), DlmanError> {
        // Update in memory
        {
            let mut downloads = self.downloads.write().await;
            if let Some(download) = downloads.get_mut(&id) {
                download.downloaded = downloaded;
                if let Some(segments) = segments {
                    download.segments = segments;
                }
            }
        }

        // Get updated download for saving
        let download = self.downloads.read().await.get(&id).cloned();

        // Save to storage
        if let Some(download) = download {
            self.storage.save_download(&download).await?;
        }

        Ok(())
    }

    /// Update speed limits for all downloads in a queue that don't have custom overrides
    async fn update_queue_downloads_speed_limit(&self, queue_id: Uuid, queue_speed_limit: u64) {
        let mut downloads_to_update = Vec::new();

        // Find downloads in this queue without custom speed limits
        {
            let downloads = self.downloads.read().await;
            for (id, download) in downloads.iter() {
                if download.queue_id == queue_id && download.speed_limit.is_none() {
                    downloads_to_update.push(*id);
                }
            }
        }

        // Update speed limits for these downloads
        for download_id in downloads_to_update {
            if let Err(e) = self.update_download_speed_limit(download_id, Some(queue_speed_limit)).await {
                error!("Failed to update speed limit for download {}: {}", download_id, e);
            }
        }
    }

    // ========================================================================
    // Queue Operations
    // ========================================================================

    /// Create a new queue
    pub async fn create_queue(
        &self,
        name: &str,
        options: dlman_types::QueueOptions,
    ) -> Result<Queue, DlmanError> {
        let mut queue = Queue::new(name.to_string());

        // Apply options
        if let Some(color) = options.color {
            queue.color = color;
        }
        if let Some(icon) = options.icon {
            queue.icon = Some(icon);
        }
        if let Some(max_concurrent) = options.max_concurrent {
            queue.max_concurrent = max_concurrent;
        }
        if let Some(speed_limit) = options.speed_limit {
            queue.speed_limit = Some(speed_limit);
        }
        if let Some(schedule) = options.schedule {
            queue.schedule = Some(schedule);
        }
        if let Some(post_action) = options.post_action {
            queue.post_action = post_action;
        }

        // Save to storage
        self.storage.save_queue(&queue).await?;

        // Add to memory
        self.queues.write().await.insert(queue.id, queue.clone());

        Ok(queue)
    }

    /// Update a queue
    pub async fn update_queue(
        &self,
        id: Uuid,
        options: dlman_types::QueueOptions,
    ) -> Result<Queue, DlmanError> {
        let mut queue = self
            .queues
            .read()
            .await
            .get(&id)
            .cloned()
            .ok_or(DlmanError::NotFound(id))?;

        // Apply options
        if let Some(name) = options.name {
            queue.name = name;
        }
        if let Some(color) = options.color {
            queue.color = color;
        }
        if let Some(icon) = options.icon {
            queue.icon = Some(icon);
        }
        if let Some(max_concurrent) = options.max_concurrent {
            queue.max_concurrent = max_concurrent;
        }
        if let Some(speed_limit) = options.speed_limit {
            queue.speed_limit = Some(speed_limit);
        }
        if let Some(schedule) = options.schedule {
            queue.schedule = Some(schedule);
        }
        if let Some(post_action) = options.post_action {
            queue.post_action = post_action;
        }

        // Save to storage
        self.storage.save_queue(&queue).await?;

        // Update speed limits for downloads in this queue if speed limit changed
        if options.speed_limit.is_some() {
            self.update_queue_downloads_speed_limit(id, options.speed_limit.unwrap()).await;
        }

        // Update in memory
        self.queues.write().await.insert(id, queue.clone());

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
        {
            let mut downloads = self.downloads.write().await;
            for download in downloads.values_mut() {
                if download.queue_id == id {
                    download.queue_id = Uuid::nil();
                }
            }
        }

        // Remove from storage
        self.storage.delete_queue(id).await?;

        // Remove from memory
        self.queues.write().await.remove(&id);

        Ok(())
    }

    /// Start a queue
    pub async fn start_queue(&self, id: Uuid) -> Result<(), DlmanError> {
        self.queue_scheduler.start_queue(id, self.clone()).await
    }

    /// Stop a queue
    pub async fn stop_queue(&self, id: Uuid) -> Result<(), DlmanError> {
        self.queue_scheduler.stop_queue(id).await
    }

    // ========================================================================
    // Bulk Operations
    // ========================================================================

    /// Probe multiple links for metadata
    pub async fn probe_links(&self, urls: Vec<String>) -> Vec<dlman_types::LinkInfo> {
        let mut results = Vec::new();

        for url in urls {
            let info = match url::Url::parse(&url) {
                Ok(parsed) => self.download_manager.probe_url(&parsed).await.unwrap_or_else(|e| {
                    dlman_types::LinkInfo {
                        url: url.clone(),
                        final_url: None,
                        filename: url.rsplit('/').next().unwrap_or("unknown").to_string(),
                        size: None,
                        content_type: None,
                        resumable: false,
                        error: Some(e.to_string()),
                    }
                }),
                Err(_) => dlman_types::LinkInfo {
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
    pub async fn move_downloads(
        &self,
        ids: Vec<Uuid>,
        queue_id: Uuid,
    ) -> Result<(), DlmanError> {
        // Verify queue exists
        if !self.queues.read().await.contains_key(&queue_id) {
            return Err(DlmanError::NotFound(queue_id));
        }

        // Update downloads
        {
            let mut downloads = self.downloads.write().await;
            let queues = self.queues.read().await;
            
            for id in &ids {
                if let Some(download) = downloads.get_mut(id) {
                    // Get the old queue's speed limit
                    let old_queue_speed_limit = queues
                        .get(&download.queue_id)
                        .map(|q| q.speed_limit)
                        .flatten();
                    
                    // Get the new queue's speed limit
                    let new_queue_speed_limit = queues
                        .get(&queue_id)
                        .map(|q| q.speed_limit)
                        .flatten();
                    
                    // Only update speed_limit if it was matching the old queue's limit
                    // (meaning it wasn't a custom override)
                    if download.speed_limit == old_queue_speed_limit {
                        download.speed_limit = new_queue_speed_limit;
                    }
                    
                    download.queue_id = queue_id;
                }
            }
        }

        // Save to storage
        for id in ids {
            let download_copy = self.downloads.read().await.get(&id).cloned();
            if let Some(download) = download_copy.as_ref() {
                self.storage.save_download(download).await?;
            }
        }

        Ok(())
    }

    // ========================================================================
    // Settings
    // ========================================================================

    /// Get current settings
    pub async fn get_settings(&self) -> Settings {
        self.settings.read().await.clone()
    }

    /// Update settings
    pub async fn update_settings(&self, settings: Settings) -> Result<(), DlmanError> {
        self.storage.save_settings(&settings).await?;
        *self.settings.write().await = settings;
        Ok(())
    }

    // ========================================================================
    // Export/Import
    // ========================================================================

    /// Export all data as JSON
    pub async fn export_data(&self) -> Result<String, DlmanError> {
        let downloads: Vec<_> = self.downloads.read().await.values().cloned().collect();
        let queues: Vec<_> = self.queues.read().await.values().cloned().collect();
        let settings = self.get_settings().await;
        let data = serde_json::json!({
            "version": 1,
            "downloads": downloads,
            "queues": queues,
            "settings": settings,
        });

        serde_json::to_string_pretty(&data).map_err(|e| DlmanError::Serialization(e.to_string()))
    }

    /// Import data from JSON
    pub async fn import_data(&self, json: &str) -> Result<(), DlmanError> {
        let data: serde_json::Value =
            serde_json::from_str(json).map_err(|e| DlmanError::Serialization(e.to_string()))?;

        // Import downloads
        if let Some(downloads) = data.get("downloads").and_then(|d| d.as_array()) {
            for download_value in downloads {
                if let Ok(download) =
                    serde_json::from_value::<Download>(download_value.clone())
                {
                    self.storage.save_download(&download).await?;
                    self.downloads.write().await.insert(download.id, download);
                }
            }
        }

        // Import queues
        if let Some(queues) = data.get("queues").and_then(|q| q.as_array()) {
            for queue_value in queues {
                if let Ok(queue) = serde_json::from_value::<Queue>(queue_value.clone()) {
                    self.storage.save_queue(&queue).await?;
                    self.queues.write().await.insert(queue.id, queue);
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

impl Clone for DlmanCore {
    fn clone(&self) -> Self {
        Self {
            downloads: Arc::clone(&self.downloads),
            queues: Arc::clone(&self.queues),
            settings: Arc::clone(&self.settings),
            storage: Arc::clone(&self.storage),
            event_tx: self.event_tx.clone(),
            download_manager: Arc::clone(&self.download_manager),
            queue_scheduler: Arc::clone(&self.queue_scheduler),
        }
    }
}

