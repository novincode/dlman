//! Application state management

use dlman_core::DlmanCore;
use dlman_types::CoreEvent;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

/// Application state managed by Tauri
pub struct AppState {
    pub core: Arc<RwLock<Option<DlmanCore>>>,
    #[allow(dead_code)]
    pub data_dir: PathBuf,
}

impl AppState {
    pub async fn new(data_dir: PathBuf) -> Result<Self, dlman_core::DlmanError> {
        let core = DlmanCore::new(data_dir.clone()).await?;

        Ok(Self {
            core: Arc::new(RwLock::new(Some(core))),
            data_dir,
        })
    }

    /// Start forwarding core events to the Tauri frontend
    pub fn start_event_forwarding(&self, app_handle: AppHandle) {
        let core = self.core.clone();
        
        tauri::async_runtime::spawn(async move {
            let guard = core.read().await;
            if let Some(core) = guard.as_ref() {
                let mut rx = core.subscribe();
                drop(guard); // Release lock before loop
                
                loop {
                    match rx.recv().await {
                        Ok(event) => {
                            // Forward event to frontend based on type
                            let event_name = match &event {
                                CoreEvent::DownloadProgress { .. } => "download-progress",
                                CoreEvent::SegmentProgress { .. } => "segment-progress",
                                CoreEvent::DownloadStatusChanged { .. } => "download-status",
                                CoreEvent::DownloadAdded { .. } => "download-added",
                                CoreEvent::DownloadUpdated { .. } => "download-updated",
                                CoreEvent::DownloadRemoved { .. } => "download-removed",
                                CoreEvent::QueueStarted { .. } => "queue-started",
                                CoreEvent::QueueCompleted { .. } => "queue-completed",
                                CoreEvent::Error { .. } => "core-error",
                            };
                            
                            // Wrap in the expected format
                            let payload = match &event {
                                CoreEvent::DownloadProgress { id, downloaded, total, speed, eta } => {
                                    serde_json::json!({
                                        "type": "DownloadProgress",
                                        "payload": {
                                            "id": id.to_string(),
                                            "downloaded": downloaded,
                                            "total": total,
                                            "speed": speed,
                                            "eta": eta
                                        }
                                    })
                                }
                                CoreEvent::SegmentProgress { download_id, segment_index, downloaded } => {
                                    serde_json::json!({
                                        "type": "SegmentProgress",
                                        "payload": {
                                            "downloadId": download_id.to_string(),
                                            "segmentIndex": segment_index,
                                            "downloaded": downloaded
                                        }
                                    })
                                }
                                CoreEvent::DownloadStatusChanged { id, status, error } => {
                                    serde_json::json!({
                                        "type": "DownloadStatusChanged",
                                        "payload": {
                                            "id": id.to_string(),
                                            "status": status,
                                            "error": error
                                        }
                                    })
                                }
                                CoreEvent::DownloadAdded { download } => {
                                    serde_json::json!({
                                        "type": "DownloadAdded",
                                        "payload": {
                                            "download": download
                                        }
                                    })
                                }
                                CoreEvent::DownloadUpdated { download } => {
                                    serde_json::json!({
                                        "type": "DownloadUpdated",
                                        "payload": {
                                            "download": download
                                        }
                                    })
                                }
                                CoreEvent::DownloadRemoved { id } => {
                                    serde_json::json!({
                                        "type": "DownloadRemoved",
                                        "payload": {
                                            "id": id.to_string()
                                        }
                                    })
                                }
                                CoreEvent::QueueStarted { id } => {
                                    serde_json::json!({
                                        "type": "QueueStarted",
                                        "payload": { "id": id.to_string() }
                                    })
                                }
                                CoreEvent::QueueCompleted { id } => {
                                    serde_json::json!({
                                        "type": "QueueCompleted",
                                        "payload": { "id": id.to_string() }
                                    })
                                }
                                CoreEvent::Error { message, context } => {
                                    serde_json::json!({
                                        "type": "Error",
                                        "payload": {
                                            "message": message,
                                            "context": context
                                        }
                                    })
                                }
                            };
                            
                            if let Err(e) = app_handle.emit(event_name, payload) {
                                tracing::warn!("Failed to emit event {}: {}", event_name, e);
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            tracing::warn!("Event receiver lagged by {} messages", n);
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                            tracing::info!("Event channel closed, stopping forwarding");
                            break;
                        }
                    }
                }
            }
        });
    }

    #[allow(dead_code)]
    pub async fn with_core<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&DlmanCore) -> R,
    {
        let guard = self.core.read().await;
        guard
            .as_ref()
            .map(f)
            .ok_or_else(|| "Core not initialized".to_string())
    }

    pub async fn with_core_async<F, Fut, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(DlmanCore) -> Fut,
        Fut: std::future::Future<Output = Result<R, dlman_core::DlmanError>>,
    {
        let guard = self.core.read().await;
        match guard.as_ref() {
            Some(core) => f(core.clone()).await.map_err(|e| e.to_string()),
            None => Err("Core not initialized".to_string()),
        }
    }
}
