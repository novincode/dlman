//! Queue Manager - manages download queues and scheduling
//!
//! Handles queue lifecycle, max concurrent downloads, and queue-based speed limits.

use crate::error::DlmanError;
use dlman_types::{CoreEvent, DownloadStatus, Queue, QueueOptions};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::info;
use uuid::Uuid;

/// Queue manager for organizing and scheduling downloads
pub struct QueueManager {
    /// All queues
    queues: Arc<RwLock<HashMap<Uuid, Queue>>>,
    /// Currently running queues
    running: Arc<RwLock<HashSet<Uuid>>>,
    /// Event broadcaster
    event_tx: broadcast::Sender<CoreEvent>,
}

impl QueueManager {
    /// Create a new queue manager
    pub fn new(queues: Vec<Queue>, event_tx: broadcast::Sender<CoreEvent>) -> Self {
        let mut queue_map = HashMap::new();
        for queue in queues {
            queue_map.insert(queue.id, queue);
        }
        
        // Ensure default queue exists
        if !queue_map.contains_key(&Uuid::nil()) {
            queue_map.insert(Uuid::nil(), Queue::default_queue());
        }
        
        Self {
            queues: Arc::new(RwLock::new(queue_map)),
            running: Arc::new(RwLock::new(HashSet::new())),
            event_tx,
        }
    }
    
    /// Get all queues
    pub async fn get_all_queues(&self) -> Vec<Queue> {
        self.queues.read().await.values().cloned().collect()
    }
    
    /// Get a queue by ID
    pub async fn get_queue(&self, id: Uuid) -> Option<Queue> {
        self.queues.read().await.get(&id).cloned()
    }
    
    /// Create a new queue
    pub async fn create_queue(&self, name: &str, options: QueueOptions) -> Result<Queue, DlmanError> {
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
        
        self.queues.write().await.insert(queue.id, queue.clone());
        
        Ok(queue)
    }
    
    /// Update a queue
    pub async fn update_queue(&self, id: Uuid, options: QueueOptions) -> Result<Queue, DlmanError> {
        let mut queues = self.queues.write().await;
        let queue = queues.get_mut(&id).ok_or(DlmanError::NotFound(id))?;
        
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
        if let Some(segment_count) = options.segment_count {
            queue.segment_count = Some(segment_count);
        }
        if let Some(schedule) = options.schedule {
            queue.schedule = Some(schedule);
        }
        if let Some(post_action) = options.post_action {
            queue.post_action = post_action;
        }
        
        let updated = queue.clone();
        Ok(updated)
    }
    
    /// Delete a queue
    pub async fn delete_queue(&self, id: Uuid) -> Result<(), DlmanError> {
        if id == Uuid::nil() {
            return Err(DlmanError::InvalidOperation(
                "Cannot delete default queue".to_string(),
            ));
        }
        
        self.queues.write().await.remove(&id);
        self.running.write().await.remove(&id);
        
        Ok(())
    }
    
    /// Start a queue
    pub async fn start_queue(
        &self,
        core: crate::DlmanCore,
        queue_id: Uuid,
    ) -> Result<(), DlmanError> {
        // Verify queue exists
        let queue = self.get_queue(queue_id).await
            .ok_or(DlmanError::NotFound(queue_id))?;
        
        // Mark as running
        self.running.write().await.insert(queue_id);
        
        // Emit event
        let _ = self.event_tx.send(CoreEvent::QueueStarted { id: queue_id });
        
        info!("Started queue: {} (max_concurrent: {})", queue.name, queue.max_concurrent);
        
        // Get all downloads in this queue
        let downloads = core.download_manager.db().get_downloads_by_queue(queue_id).await?;
        
        // Filter to queued/paused/failed downloads
        let startable: Vec<_> = downloads
            .into_iter()
            .filter(|d| matches!(
                d.status,
                DownloadStatus::Queued | DownloadStatus::Paused | DownloadStatus::Failed
            ))
            .collect();
        
        info!("Found {} startable downloads in queue", startable.len());
        
        // Start up to max_concurrent downloads
        let mut started = 0;
        for download in startable {
            if started >= queue.max_concurrent {
                break;
            }
            
            info!("Starting download: {}", download.filename);
            if let Err(e) = core.resume_download(download.id).await {
                tracing::warn!("Failed to start download {}: {}", download.id, e);
            } else {
                started += 1;
            }
        }
        
        info!("Started {} downloads", started);
        
        Ok(())
    }
    
    /// Stop a queue
    pub async fn stop_queue(&self, queue_id: Uuid) -> Result<(), DlmanError> {
        self.running.write().await.remove(&queue_id);
        
        // Emit event
        let _ = self.event_tx.send(CoreEvent::QueueCompleted { id: queue_id });
        
        Ok(())
    }
    
    /// Check if a queue is running
    pub async fn is_running(&self, queue_id: Uuid) -> bool {
        self.running.read().await.contains(&queue_id)
    }
    
    /// Try to start the next download in a queue
    pub async fn try_start_next_download(
        &self,
        core: crate::DlmanCore,
        queue_id: Uuid,
    ) -> Result<(), DlmanError> {
        // Check if queue is running
        if !self.is_running(queue_id).await {
            return Ok(());
        }
        
        // Get queue
        let queue = self.get_queue(queue_id).await
            .ok_or(DlmanError::NotFound(queue_id))?;
        
        // Count currently downloading in this queue
        let downloads = core.download_manager.db().get_downloads_by_queue(queue_id).await?;
        let active_count = downloads
            .iter()
            .filter(|d| d.status == DownloadStatus::Downloading)
            .count();
        
        // If under limit, start next queued download
        if active_count < queue.max_concurrent as usize {
            let next = downloads
                .into_iter()
                .find(|d| d.status == DownloadStatus::Queued);
            
            if let Some(download) = next {
                info!("Auto-starting next download in queue: {}", download.filename);
                core.resume_download(download.id).await?;
            }
        }
        
        Ok(())
    }
}
