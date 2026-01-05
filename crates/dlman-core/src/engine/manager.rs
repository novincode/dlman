//! Download Manager - manages all active downloads
//!
//! This is the top-level coordinator that:
//! - Starts/stops/pauses/resumes downloads
//! - Manages the global rate limiter
//! - Handles download queue logic

use crate::engine::{DownloadDatabase, DownloadTask, RateLimiter};
use crate::error::DlmanError;
use dlman_types::{CoreEvent, Download, DownloadStatus, LinkInfo, ProxySettings};
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

/// Build an HTTP client with optional proxy settings
pub fn build_http_client(proxy_settings: Option<&ProxySettings>) -> Result<Client, DlmanError> {
    let mut builder = Client::builder()
        .user_agent("DLMan/2.0.0")
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(120));
    
    // Configure proxy based on settings
    if let Some(proxy) = proxy_settings {
        match proxy.mode.as_str() {
            "none" => {
                // Disable all proxies
                builder = builder.no_proxy();
            }
            "manual" => {
                // Manual proxy configuration
                if let Some(ref http_proxy) = proxy.http_proxy {
                    if !http_proxy.is_empty() {
                        let mut proxy_builder = reqwest::Proxy::http(http_proxy)
                            .map_err(|e| DlmanError::Unknown(format!("Invalid HTTP proxy: {}", e)))?;
                        
                        // Add authentication if provided
                        if let (Some(ref user), Some(ref pass)) = (&proxy.username, &proxy.password) {
                            if !user.is_empty() {
                                proxy_builder = proxy_builder.basic_auth(user, pass);
                            }
                        }
                        
                        builder = builder.proxy(proxy_builder);
                    }
                }
                
                if let Some(ref https_proxy) = proxy.https_proxy {
                    if !https_proxy.is_empty() {
                        let mut proxy_builder = reqwest::Proxy::https(https_proxy)
                            .map_err(|e| DlmanError::Unknown(format!("Invalid HTTPS proxy: {}", e)))?;
                        
                        if let (Some(ref user), Some(ref pass)) = (&proxy.username, &proxy.password) {
                            if !user.is_empty() {
                                proxy_builder = proxy_builder.basic_auth(user, pass);
                            }
                        }
                        
                        builder = builder.proxy(proxy_builder);
                    }
                }
                
                // Set no_proxy if configured
                if let Some(ref no_proxy) = proxy.no_proxy {
                    if !no_proxy.is_empty() {
                        std::env::set_var("NO_PROXY", no_proxy);
                    }
                }
            }
            _ => {
                // "system" - use system proxy (default behavior, no configuration needed)
                // reqwest automatically uses HTTP_PROXY, HTTPS_PROXY, NO_PROXY env vars
            }
        }
    }
    
    builder
        .build()
        .map_err(|e| DlmanError::Unknown(e.to_string()))
}

impl DownloadManager {
    /// Create a new download manager
    pub async fn new(
        data_dir: PathBuf,
        event_tx: broadcast::Sender<CoreEvent>,
    ) -> Result<Self, DlmanError> {
        Self::new_with_proxy(data_dir, event_tx, None).await
    }
    
    /// Create a new download manager with proxy settings
    pub async fn new_with_proxy(
        data_dir: PathBuf,
        event_tx: broadcast::Sender<CoreEvent>,
        proxy_settings: Option<&ProxySettings>,
    ) -> Result<Self, DlmanError> {
        // Create temp directory for segment files
        let temp_dir = data_dir.join("temp");
        tokio::fs::create_dir_all(&temp_dir).await?;
        
        // Initialize database
        let db_path = data_dir.join("downloads.db");
        let db = DownloadDatabase::new(db_path).await?;
        
        // Create HTTP client with proxy settings
        let client = build_http_client(proxy_settings)?;
        
        Ok(Self {
            active_tasks: Arc::new(RwLock::new(HashMap::new())),
            client,
            db,
            temp_dir,
            event_tx,
        })
    }
    
    /// Update the HTTP client with new proxy settings
    pub fn update_proxy(&mut self, proxy_settings: Option<&ProxySettings>) -> Result<(), DlmanError> {
        self.client = build_http_client(proxy_settings)?;
        Ok(())
    }
    
    /// Get the database reference
    pub fn db(&self) -> &DownloadDatabase {
        &self.db
    }
    
    /// Probe a URL for metadata
    /// Uses HEAD request first, falls back to partial GET if HEAD doesn't return size
    /// (some servers like GitHub don't return Content-Length for HEAD on redirected downloads)
    pub async fn probe_url(&self, url: &url::Url) -> Result<LinkInfo, DlmanError> {
        info!("Probing URL: {}", url);
        
        // Try HEAD first
        let response = self.client.head(url.as_str()).send().await?;
        
        let final_url = response.url().to_string();
        let mut size = response
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok());
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let mut resumable = response
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .and_then(|v| v.to_str().ok())
            .map(|s| s == "bytes")
            .unwrap_or(false);
        
        // If HEAD didn't give us size, try a GET with Range header to get more info
        // This is needed for GitHub releases and similar CDNs
        if size.is_none() {
            info!("HEAD didn't return Content-Length, trying partial GET...");
            match self.client
                .get(&final_url)
                .header(reqwest::header::RANGE, "bytes=0-0")
                .send()
                .await
            {
                Ok(range_response) => {
                    let status = range_response.status();
                    info!("Partial GET response status: {}", status);
                    
                    // Check Content-Range header for total size: "bytes 0-0/12345"
                    if let Some(content_range) = range_response.headers().get(reqwest::header::CONTENT_RANGE) {
                        if let Ok(range_str) = content_range.to_str() {
                            info!("Content-Range header: {}", range_str);
                            if let Some(total) = range_str.split('/').last() {
                                if total != "*" { // "*" means unknown size
                                    if let Ok(total_size) = total.parse::<u64>() {
                                        size = Some(total_size);
                                        resumable = true;
                                        info!("Got size from Content-Range: {} bytes", total_size);
                                    }
                                }
                            }
                        }
                    }
                    
                    // Check if we got a 206 Partial Content - means range is supported
                    if status == reqwest::StatusCode::PARTIAL_CONTENT {
                        resumable = true;
                    } else if status == reqwest::StatusCode::OK {
                        // Server ignored Range header - likely streaming/dynamic content
                        // Try to get Content-Length from this response
                        if let Some(len) = range_response.headers()
                            .get(reqwest::header::CONTENT_LENGTH)
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<u64>().ok())
                        {
                            // Only use this if it's a reasonable size (> 1KB)
                            // Some streaming servers return chunked encoding with no real length
                            if len > 1024 {
                                size = Some(len);
                                info!("Got size from full GET Content-Length: {} bytes", len);
                            }
                        }
                        // No range support for this URL
                        resumable = false;
                        info!("Server doesn't support Range requests (likely streaming/dynamic content)");
                    }
                }
                Err(e) => {
                    info!("Partial GET failed (continuing without size): {}", e);
                }
            }
        }
        
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
        
        // Use write lock from the start to prevent race conditions
        // This ensures atomicity: check-then-insert happens under a single lock
        let mut active_tasks = self.active_tasks.write().await;
        
        // Check if already running
        if active_tasks.contains_key(&id) {
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
        
        // Clone for cleanup task (clone before we hold the write lock to avoid deadlock)
        let active_tasks_for_cleanup = self.active_tasks.clone();
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
            active_tasks_for_cleanup.write().await.remove(&task_id);
            result
        });
        
        // Store handle with shared control flags and rate limiter
        // We still hold the write lock from the beginning of this function
        active_tasks.insert(
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
