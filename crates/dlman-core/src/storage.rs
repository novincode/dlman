//! Storage layer for persistent data (queues only - settings and downloads are in SQLite)

use crate::error::DlmanError;
use dlman_types::Queue;
use std::path::PathBuf;
use tokio::fs;
use uuid::Uuid;

/// Storage manager for DLMan data (queues only)
#[derive(Clone)]
#[derive(Debug)]
pub struct Storage {
    /// Data directory
    data_dir: PathBuf,
}

impl Storage {
    /// Create a new storage instance
    pub async fn new(data_dir: PathBuf) -> Result<Self, DlmanError> {
        // Create data directories
        fs::create_dir_all(&data_dir).await?;
        fs::create_dir_all(data_dir.join("queues")).await?;

        Ok(Self { data_dir })
    }

    // ========================================================================
    // Queues (JSON files - will migrate to SQLite later)
    // ========================================================================

    /// Load all queues from storage
    pub async fn load_queues(&self) -> Result<Vec<Queue>, DlmanError> {
        let queues_dir = self.data_dir.join("queues");
        let mut queues = Vec::new();

        if !queues_dir.exists() {
            return Ok(queues);
        }

        let mut entries = fs::read_dir(&queues_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = fs::read_to_string(&path).await {
                    if let Ok(queue) = serde_json::from_str::<Queue>(&content) {
                        queues.push(queue);
                    }
                }
            }
        }

        Ok(queues)
    }

    /// Save a queue to storage
    pub async fn save_queue(&self, queue: &Queue) -> Result<(), DlmanError> {
        let path = self
            .data_dir
            .join("queues")
            .join(format!("{}.json", queue.id));

        let content =
            serde_json::to_string_pretty(queue).map_err(|e| DlmanError::Serialization(e.to_string()))?;

        fs::write(&path, content).await?;

        Ok(())
    }

    /// Delete a queue from storage
    pub async fn delete_queue(&self, id: Uuid) -> Result<(), DlmanError> {
        let path = self.data_dir.join("queues").join(format!("{}.json", id));

        if path.exists() {
            fs::remove_file(&path).await?;
        }

        Ok(())
    }
}
