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

use dlman_types::{CoreEvent, Download, Queue, Settings};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::RwLock;
use uuid::Uuid;

/// The main DLMan core instance
pub struct DlmanCore {
    /// Active downloads
    pub downloads: Arc<RwLock<HashMap<Uuid, Download>>>,
    /// Configured queues
    pub queues: Arc<RwLock<HashMap<Uuid, Queue>>>,
    /// Application settings
    pub settings: Arc<RwLock<Settings>>,
    /// Database connection
    pub storage: Storage,
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
            storage,
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

        // Get queue's speed limit if the download doesn't have its own
        if download.speed_limit.is_none() {
            let queues = self.queues.read().await;
            if let Some(queue) = queues.get(&queue_id) {
                download.speed_limit = queue.speed_limit;
            }
        }

        // Set status to downloading
        download.status = dlman_types::DownloadStatus::Downloading;

        // Save to storage
        self.storage.save_download(&download).await?;

        // Add to active downloads
        self.downloads.write().await.insert(id, download.clone());

        // Emit event
        self.emit(CoreEvent::DownloadAdded {
            download: download.clone(),
        });

        // Actually start the download
        self.download_manager.start(download.clone(), self.clone()).await?;

        Ok(download)
    }

    /// Pause a download
    pub async fn pause_download(&self, id: Uuid) -> Result<(), DlmanError> {
        // Try to cancel the active download task (if running)
        let _ = self.download_manager.pause(id).await;
        // Always update the status
        self.update_download_status(id, dlman_types::DownloadStatus::Paused, None)
            .await
    }

    /// Resume a download
    pub async fn resume_download(&self, id: Uuid) -> Result<(), DlmanError> {
        let download = self
            .downloads
            .read()
            .await
            .get(&id)
            .cloned()
            .ok_or(DlmanError::NotFound(id))?;

        self.download_manager.start(download, self.clone()).await?;
        self.update_download_status(id, dlman_types::DownloadStatus::Downloading, None)
            .await
    }

    /// Cancel a download
    pub async fn cancel_download(&self, id: Uuid) -> Result<(), DlmanError> {
        self.download_manager.cancel(id).await?;
        self.update_download_status(id, dlman_types::DownloadStatus::Cancelled, None)
            .await
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
        // Update in memory
        {
            let mut downloads = self.downloads.write().await;
            if let Some(download) = downloads.get_mut(&id) {
                download.status = status;
                download.error = error.clone();
                if status == dlman_types::DownloadStatus::Completed {
                    download.completed_at = Some(chrono::Utc::now());
                }
            }
        }

        // Save to storage
        let download_copy = self.downloads.read().await.get(&id).cloned();
        if let Some(download) = download_copy.as_ref() {
            self.storage.save_download(download).await?;
        }

        // Emit event
        self.emit(CoreEvent::DownloadStatusChanged { id, status, error });

        Ok(())
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
            for id in &ids {
                if let Some(download) = downloads.get_mut(id) {
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
            storage: self.storage.clone(),
            event_tx: self.event_tx.clone(),
            download_manager: Arc::clone(&self.download_manager),
            queue_scheduler: Arc::clone(&self.queue_scheduler),
        }
    }
}
