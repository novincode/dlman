//! Download Manager - manages all active downloads
//!
//! This is the top-level coordinator that:
//! - Starts/stops/pauses/resumes downloads
//! - Manages the global rate limiter
//! - Handles download queue logic

use crate::engine::{DownloadDatabase, DownloadTask, RateLimiter};
use crate::error::DlmanError;
use dlman_types::{CoreEvent, Download, DownloadStatus, LinkInfo};
use reqwest::Client;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};
use tracing::{info, warn};
use uuid::Uuid;

/// Download manager that coordinates all downloads
pub struct DownloadManager {
    /// Active download tasks
    active_tasks: Arc<RwLock<HashMap<Uuid, DownloadTaskHandle>>>,
    /// HTTP client
    client: Client,
    /// Database
    db: DownloadDatabase,
    /// Temporary directory for segment files
    temp_dir: PathBuf,
    /// Event broadcaster
    event_tx: broadcast::Sender<CoreEvent>,
}

/// Handle to a running download task
struct DownloadTaskHandle {
    /// Join handle for the task
    _task_handle: tokio::task::JoinHandle<Result<(), DlmanError>>,
    /// Shared references for control
    paused: Arc<std::sync::atomic::AtomicBool>,
    cancelled: Arc<std::sync::atomic::AtomicBool>,
    /// Rate limiter for this specific download
    rate_limiter: RateLimiter,
}

impl DownloadManager {
    /// Create a new download manager
    pub async fn new(
        data_dir: PathBuf,
        event_tx: broadcast::Sender<CoreEvent>,
    ) -> Result<Self, DlmanError> {
        // Create temp directory for segment files
        let temp_dir = data_dir.join("temp");
        tokio::fs::create_dir_all(&temp_dir).await?;
        
        // Initialize database
        let db_path = data_dir.join("downloads.db");
        let db = DownloadDatabase::new(db_path).await?;
        
        // Create HTTP client
        let client = Client::builder()
            .user_agent("DLMan/2.0.0")
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| DlmanError::Unknown(e.to_string()))?;
        
        Ok(Self {
            active_tasks: Arc::new(RwLock::new(HashMap::new())),
            client,
            db,
            temp_dir,
            event_tx,
        })
    }
    
    /// Get the database reference
    pub fn db(&self) -> &DownloadDatabase {
        &self.db
    }
    
    /// Probe a URL for metadata
    pub async fn probe_url(&self, url: &url::Url) -> Result<LinkInfo, DlmanError> {
        info!("Probing URL: {}", url);
        
        let response = self.client.head(url.as_str()).send().await?;
        
        let final_url = response.url().to_string();
        let size = response
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok());
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let resumable = response
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .and_then(|v| v.to_str().ok())
            .map(|s| s == "bytes")
            .unwrap_or(false);
        
        let filename = response
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| {
                v.split("filename=")
                    .nth(1)
                    .map(|s| s.trim_matches('"').to_string())
            })
            .unwrap_or_else(|| {
                url.path_segments()
                    .and_then(|s| s.last())
                    .unwrap_or("download")
                    .to_string()
            });
        
        Ok(LinkInfo {
            url: url.to_string(),
            final_url: Some(final_url),
            filename,
            size,
            content_type,
            resumable,
            error: None,
        })
    }
    
    /// Start or resume a download
    pub async fn start(
        &self, 
        download: Download, 
        speed_limit: Option<u64>, 
        segment_count: u32,
        max_retries: u32,
        retry_delay_secs: u32,
    ) -> Result<(), DlmanError> {
        let id = download.id;
        
        // Check if already running
        if self.active_tasks.read().await.contains_key(&id) {
            warn!("Download {} is already running", id);
            return Ok(());
        }
        
        info!("Starting download {}: {} (segments: {}, speed_limit: {:?}, max_retries: {})", 
              id, download.filename, segment_count, speed_limit, max_retries);
        
        // Create a per-download rate limiter with the effective speed limit
        // This ensures each download respects its own limit independently
        let download_rate_limiter = match speed_limit {
            Some(limit) if limit > 0 => {
                info!("Setting rate limiter to {} bytes/sec", limit);
                RateLimiter::new(limit)
            },
            _ => {
                info!("No speed limit - using unlimited rate limiter");
                RateLimiter::unlimited()
            }
        };
        
        // Clone the rate limiter so we can keep a reference for dynamic updates
        let rate_limiter_for_handle = download_rate_limiter.clone();
        
        // Create control flags that are shared with the task
        let paused = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        
        // Clone for cleanup task
        let active_tasks = self.active_tasks.clone();
        let task_id = id;
        
        // Create download task with its own rate limiter
        let task = DownloadTask::new(
            download,
            self.temp_dir.clone(),
            self.client.clone(),
            download_rate_limiter,
            self.db.clone(),
            self.event_tx.clone(),
            paused.clone(),
            cancelled.clone(),
            segment_count,
            max_retries,
            retry_delay_secs,
        );
        
        // Spawn task with cleanup
        let task_handle = tokio::spawn(async move {
            let result = task.run().await;
            // Remove from active tasks when done
            active_tasks.write().await.remove(&task_id);
            result
        });
        
        // Store handle with shared control flags and rate limiter
        self.active_tasks.write().await.insert(
            id,
            DownloadTaskHandle {
                _task_handle: task_handle,
                paused,
                cancelled,
                rate_limiter: rate_limiter_for_handle,
            },
        );
        
        Ok(())
    }
    
    /// Pause a download
    pub async fn pause(&self, id: Uuid) -> Result<(), DlmanError> {
        // Set pause flag immediately - the task will save progress and exit
        if let Some(handle) = self.active_tasks.read().await.get(&id) {
            handle.paused.store(true, std::sync::atomic::Ordering::Release);
            info!("Signaled pause for download {}", id);
        }
        
        // Emit status change event immediately for responsive UI
        let _ = self.event_tx.send(CoreEvent::DownloadStatusChanged {
            id,
            status: DownloadStatus::Paused,
            error: None,
        });
        
        // Update DB in background (non-blocking)
        let db = self.db.clone();
        tokio::spawn(async move {
            if let Err(e) = db.update_download_status(id, DownloadStatus::Paused, None).await {
                tracing::warn!("Failed to update pause status in DB: {}", e);
            }
        });
        
        Ok(())
    }
    
    /// Resume a download
    /// `effective_speed_limit` - the resolved speed limit (download override > queue limit > None for unlimited)
    /// `segment_count` - number of segments for new downloads (ignored if download already has segments)
    pub async fn resume(
        &self, 
        id: Uuid, 
        effective_speed_limit: Option<u64>, 
        segment_count: u32,
        max_retries: u32,
        retry_delay_secs: u32,
    ) -> Result<(), DlmanError> {
        // Check if task is still running (might be if pause was very recent)
        {
            let tasks = self.active_tasks.read().await;
            if let Some(handle) = tasks.get(&id) {
                // Task still running, just unpause
                handle.paused.store(false, std::sync::atomic::Ordering::Release);
                info!("Unpaused running download {}", id);
                
                // Update rate limiter with effective limit if provided
                if let Some(limit) = effective_speed_limit {
                    handle.rate_limiter.set_limit(limit).await;
                }
                
                // Emit status change
                let _ = self.event_tx.send(CoreEvent::DownloadStatusChanged {
                    id,
                    status: DownloadStatus::Downloading,
                    error: None,
                });
                
                // Update DB in background
                let db = self.db.clone();
                tokio::spawn(async move {
                    let _ = db.update_download_status(id, DownloadStatus::Downloading, None).await;
                });
                
                return Ok(());
            }
        }
        
        // Task not running, need to start fresh
        info!("Resuming download {} from DB", id);
        
        // Load from DB
        let download = self.db.load_download(id).await?
            .ok_or(DlmanError::NotFound(id))?;
        
        // Start the download with the effective speed limit
        self.start(download, effective_speed_limit, segment_count, max_retries, retry_delay_secs).await?;
        
        Ok(())
    }
    
    /// Cancel a download
    pub async fn cancel(&self, id: Uuid) -> Result<(), DlmanError> {
        let mut tasks = self.active_tasks.write().await;
        
        if let Some(handle) = tasks.remove(&id) {
            handle.cancelled.store(true, std::sync::atomic::Ordering::Release);
            info!("Cancelled download {}", id);
        }
        
        // Update status in DB
        self.db.update_download_status(id, DownloadStatus::Cancelled, None).await?;
        
        // Emit status change event
        let _ = self.event_tx.send(CoreEvent::DownloadStatusChanged {
            id,
            status: DownloadStatus::Cancelled,
            error: None,
        });
        
        Ok(())
    }
    
    /// Delete a download
    pub async fn delete(&self, id: Uuid, delete_file: bool) -> Result<(), DlmanError> {
        // Cancel if running
        self.cancel(id).await?;
        
        // Load download info
        let download = self.db.load_download(id).await?;
        
        if let Some(download) = download {
            // Delete file if requested and completed
            if delete_file && download.status == DownloadStatus::Completed {
                let file_path = download.destination.join(&download.filename);
                if file_path.exists() {
                    tokio::fs::remove_file(&file_path).await?;
                }
            }
            
            // Delete temp files
            for segment in &download.segments {
                let temp_path = self.temp_dir.join(format!(
                    "{}_segment_{}.part",
                    id, segment.index
                ));
                if temp_path.exists() {
                    let _ = tokio::fs::remove_file(&temp_path).await;
                }
            }
        }
        
        // Delete from DB
        self.db.delete_download(id).await?;
        
        // Emit event
        let _ = self.event_tx.send(CoreEvent::DownloadRemoved { id });
        
        Ok(())
    }
    
    /// Update speed limit for a download
    /// Stores `speed_limit` in DB and applies `effective_limit` to active downloads
    pub async fn update_speed_limit_with_effective(
        &self, 
        id: Uuid, 
        speed_limit: Option<u64>,
        effective_limit: Option<u64>,
    ) -> Result<(), DlmanError> {
        // Update in DB (store the user's setting, not the resolved value)
        let download = self.db.load_download(id).await?
            .ok_or(DlmanError::NotFound(id))?;
        
        let mut updated = download;
        updated.speed_limit = speed_limit;
        self.db.upsert_download(&updated).await?;
        
        // Update rate limiter if download is active
        let tasks = self.active_tasks.read().await;
        if let Some(handle) = tasks.get(&id) {
            let limit = effective_limit.unwrap_or(u64::MAX);
            handle.rate_limiter.set_limit(limit).await;
            info!("Updated speed limit for active download {} to {:?} (effective: {:?})", id, speed_limit, effective_limit);
        }
        
        Ok(())
    }
    
    /// Update speed limit for a download (simple version, effective = stored)
    pub async fn update_speed_limit(&self, id: Uuid, speed_limit: Option<u64>) -> Result<(), DlmanError> {
        self.update_speed_limit_with_effective(id, speed_limit, speed_limit).await
    }
    
    /// Pause all downloads
    pub async fn pause_all(&self) -> Result<(), DlmanError> {
        let tasks = self.active_tasks.read().await;
        let ids: Vec<Uuid> = tasks.keys().copied().collect();
        drop(tasks);
        
        for id in ids {
            self.pause(id).await?;
        }
        
        Ok(())
    }
    
    /// Resume all paused downloads
    /// Note: This uses default values. For proper queue/settings resolution,
    /// use the DlmanCore API instead.
    pub async fn resume_all(&self) -> Result<(), DlmanError> {
        // Load all paused downloads from DB
        let all_downloads = self.db.load_all_downloads().await?;
        let paused: Vec<Download> = all_downloads
            .into_iter()
            .filter(|d| d.status == DownloadStatus::Paused)
            .collect();
        
        for download in paused {
            // Use download's stored speed limit and default settings
            // Queue resolution should be done at API layer
            let segment_count = if download.segments.is_empty() { 4 } else { download.segments.len() as u32 };
            // Use default retry settings
            self.resume(download.id, download.speed_limit, segment_count, 5, 30).await?;
        }
        
        Ok(())
    }
    
    /// Get count of active downloads
    pub async fn active_count(&self) -> usize {
        self.active_tasks.read().await.len()
    }
    
    /// Check if a download is active
    pub async fn is_active(&self, id: Uuid) -> bool {
        self.active_tasks.read().await.contains_key(&id)
    }
    
    /// Restore downloads on app startup
    pub async fn restore_downloads(&self) -> Result<Vec<Download>, DlmanError> {
        let downloads = self.db.load_all_downloads().await?;
        
        info!("Loaded {} downloads from database", downloads.len());
        
        // Auto-resume downloads that were downloading when app closed
        let downloading: Vec<Download> = downloads
            .iter()
            .filter(|d| d.status == DownloadStatus::Downloading)
            .cloned()
            .collect();
        
        for download in &downloading {
            info!("Auto-resuming download: {}", download.filename);
            // Set to paused first so resume logic works
            self.db.update_download_status(download.id, DownloadStatus::Paused, None).await?;
        }
        
        Ok(downloads)
    }
}
