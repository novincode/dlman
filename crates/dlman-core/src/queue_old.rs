//! Queue scheduler and management

use crate::error::DlmanError;
use crate::DlmanCore;
use dlman_types::{CoreEvent, DownloadStatus};
use tokio::sync::RwLock as AsyncRwLock;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

/// Manages queue scheduling and execution
#[derive(Debug)]
pub struct QueueScheduler {
    /// Currently running queues
    running: Arc<AsyncRwLock<HashSet<Uuid>>>,
    /// Event broadcaster
    event_tx: broadcast::Sender<CoreEvent>,
}

impl QueueScheduler {
    pub fn new(event_tx: broadcast::Sender<CoreEvent>) -> Self {
        Self {
            running: Arc::new(AsyncRwLock::new(HashSet::new())),
            event_tx,
        }
    }

    /// Check if a queue is currently running
    pub async fn is_queue_running(&self, queue_id: Uuid) -> bool {
        self.running.read().await.contains(&queue_id)
    }

    /// Start processing a queue
    pub async fn start_queue(&self, queue_id: Uuid, core: DlmanCore) -> Result<(), DlmanError> {
        // Check if queue exists
        let queue = core
            .queues
            .read()
            .await
            .get(&queue_id)
            .cloned()
            .ok_or(DlmanError::NotFound(queue_id))?;

        // Check if already running
        if self.running.read().await.contains(&queue_id) {
            return Ok(());
        }

        // Mark as running
        self.running.write().await.insert(queue_id);

        // Emit event
        let _ = self.event_tx.send(CoreEvent::QueueStarted { id: queue_id });

        // Get pending downloads for this queue
        let pending_downloads: Vec<_> = core
            .downloads
            .read()
            .await
            .values()
            .filter(|d| d.queue_id == queue_id && d.status == DownloadStatus::Queued)
            .cloned()
            .collect();

        // Start downloads up to max_concurrent
        let mut started = 0;
        for download in pending_downloads {
            if started >= queue.max_concurrent {
                break;
            }

            if let Err(e) = core.resume_download(download.id).await {
                tracing::warn!("Failed to start download {}: {}", download.id, e);
            } else {
                started += 1;
            }
        }

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

    /// Try to start the next download in a running queue
    pub async fn try_start_next_download(&self, core: &DlmanCore, queue_id: Uuid) -> Result<(), DlmanError> {
        // Check if queue is running
        if !self.is_running(queue_id).await {
            return Ok(());
        }

        // Get queue
        let queue = core
            .queues
            .read()
            .await
            .get(&queue_id)
            .cloned()
            .ok_or(DlmanError::NotFound(queue_id))?;

        // Count currently active downloads in this queue
        let active_count = core
            .downloads
            .read()
            .await
            .values()
            .filter(|d| d.queue_id == queue_id && d.status == DownloadStatus::Downloading)
            .count();

        // If we have capacity, start the next queued download
        if active_count < queue.max_concurrent as usize {
            // Find the next queued download
            let next_download = core
                .downloads
                .read()
                .await
                .values()
                .find(|d| d.queue_id == queue_id && d.status == DownloadStatus::Queued)
                .cloned();

            if let Some(download) = next_download {
                if let Err(e) = core.resume_download(download.id).await {
                    tracing::warn!("Failed to start next download {}: {}", download.id, e);
                }
            }
        }

        Ok(())
    }
}
