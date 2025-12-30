//! Download manager and engine

use crate::error::DlmanError;
use crate::DlmanCore;
use dlman_types::{CoreEvent, Download, DownloadStatus, LinkInfo, Segment};
use futures::StreamExt;
use parking_lot::RwLock;
use reqwest::Client;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::fs::{File, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Manages all download operations
pub struct DownloadManager {
    /// HTTP client
    client: Client,
    /// Active download tasks
    active: Arc<RwLock<HashMap<Uuid, CancellationToken>>>,
    /// Event broadcaster
    event_tx: broadcast::Sender<CoreEvent>,
}

impl DownloadManager {
    pub fn new(event_tx: broadcast::Sender<CoreEvent>) -> Self {
        let client = Client::builder()
            .user_agent("DLMan/0.1.0")
            .connect_timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            active: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// Probe a URL to get file information
    pub async fn probe_url(&self, url: &url::Url) -> Result<LinkInfo, DlmanError> {
        info!("Probing URL: {}", url);

        let response = self.client.head(url.as_str()).send().await?;

        // Follow redirects to get final URL
        let final_url = response.url().to_string();

        // Get content length
        let size = response
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok());

        // Get content type
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        // Check if resumable
        let resumable = response
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .map(|v| v.to_str().unwrap_or("") == "bytes")
            .unwrap_or(false);

        // Extract filename from Content-Disposition or URL
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

    /// Start a download
    pub async fn start(&self, download: Download, _core: DlmanCore) -> Result<(), DlmanError> {
        let id = download.id;

        // Check if already running
        if self.active.read().contains_key(&id) {
            warn!("Download {} is already running", id);
            return Ok(());
        }

        // Create cancellation token
        let cancel_token = CancellationToken::new();
        self.active.write().insert(id, cancel_token.clone());

        // Clone what we need for the task
        let client = self.client.clone();
        let event_tx = self.event_tx.clone();
        let active = Arc::clone(&self.active);

        // Spawn download task
        tokio::spawn(async move {
            let result = download_file(client, download.clone(), cancel_token.clone(), event_tx.clone()).await;

            // Remove from active
            active.write().remove(&id);

            // Update status based on result
            match result {
                Ok(()) => {
                    info!("Download {} completed", id);
                    let _ = event_tx.send(CoreEvent::DownloadStatusChanged {
                        id,
                        status: DownloadStatus::Completed,
                        error: None,
                    });
                }
                Err(DlmanError::Cancelled) => {
                    info!("Download {} cancelled", id);
                }
                Err(e) => {
                    error!("Download {} failed: {}", id, e);
                    let _ = event_tx.send(CoreEvent::DownloadStatusChanged {
                        id,
                        status: DownloadStatus::Failed,
                        error: Some(e.to_string()),
                    });
                }
            }
        });

        Ok(())
    }

    /// Pause a download
    pub async fn pause(&self, id: Uuid) -> Result<(), DlmanError> {
        if let Some(token) = self.active.write().remove(&id) {
            token.cancel();
            Ok(())
        } else {
            Err(DlmanError::NotFound(id))
        }
    }

    /// Cancel a download
    pub async fn cancel(&self, id: Uuid) -> Result<(), DlmanError> {
        self.pause(id).await
    }
}

/// Perform the actual file download
async fn download_file(
    client: Client,
    download: Download,
    cancel_token: CancellationToken,
    event_tx: broadcast::Sender<CoreEvent>,
) -> Result<(), DlmanError> {
    let url = download.final_url.as_ref().unwrap_or(&download.url);
    let dest_path = download.destination.join(&download.filename);

    info!("Starting download: {} -> {:?}", url, dest_path);

    // Create destination directory
    if let Some(parent) = dest_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    // Check if we should use segments
    let use_segments = download.size.map(|s| s > 1024 * 1024).unwrap_or(false);
    
    if use_segments && !download.segments.is_empty() {
        // Multi-segment download
        download_segmented(client, url, &dest_path, download.clone(), cancel_token, event_tx).await
    } else {
        // Single stream download
        download_single(client, url, &dest_path, download.id, cancel_token, event_tx).await
    }
}

/// Download file as a single stream
async fn download_single(
    client: Client,
    url: &str,
    dest_path: &Path,
    id: Uuid,
    cancel_token: CancellationToken,
    event_tx: broadcast::Sender<CoreEvent>,
) -> Result<(), DlmanError> {
    let response = client.get(url).send().await?;
    
    if !response.status().is_success() {
        return Err(DlmanError::ServerError {
            status: response.status().as_u16(),
            message: response.status().to_string(),
        });
    }

    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = File::create(dest_path).await?;
    let mut downloaded: u64 = 0;
    let mut last_update = std::time::Instant::now();
    let mut last_downloaded: u64 = 0;

    while let Some(chunk_result) = tokio::select! {
        chunk = stream.next() => chunk,
        _ = cancel_token.cancelled() => {
            return Err(DlmanError::Cancelled);
        }
    } {
        let chunk = chunk_result?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        // Throttle progress updates to every 100ms
        if last_update.elapsed() >= std::time::Duration::from_millis(100) {
            let elapsed = last_update.elapsed().as_secs_f64();
            let speed = ((downloaded - last_downloaded) as f64 / elapsed) as u64;
            let eta = total.map(|t| ((t - downloaded) as f64 / speed as f64) as u64);

            let _ = event_tx.send(CoreEvent::DownloadProgress {
                id,
                downloaded,
                total,
                speed,
                eta,
            });

            last_update = std::time::Instant::now();
            last_downloaded = downloaded;
        }
    }

    file.flush().await?;
    
    Ok(())
}

/// Download file using multiple segments
async fn download_segmented(
    client: Client,
    url: &str,
    dest_path: &Path,
    download: Download,
    cancel_token: CancellationToken,
    event_tx: broadcast::Sender<CoreEvent>,
) -> Result<(), DlmanError> {
    let total_size = download.size.ok_or(DlmanError::ResumeNotSupported)?;
    let id = download.id;

    // Calculate segments if not already defined
    let segments = if download.segments.is_empty() {
        calculate_segments(total_size, 4)
    } else {
        download.segments.clone()
    };

    // Create temp files for each segment
    let segment_paths: Vec<_> = segments
        .iter()
        .map(|s| dest_path.with_extension(format!("part{}", s.index)))
        .collect();

    // Download each segment concurrently
    let mut handles = Vec::new();
    
    for (segment, path) in segments.iter().zip(segment_paths.iter()) {
        if segment.complete {
            continue;
        }

        let client = client.clone();
        let url = url.to_string();
        let path = path.clone();
        let segment = segment.clone();
        let cancel_token = cancel_token.clone();

        handles.push(tokio::spawn(async move {
            download_segment(&client, &url, &path, &segment, cancel_token).await
        }));
    }

    // Wait for all segments
    let progress = Arc::new(RwLock::new(0u64));
    let mut last_update = std::time::Instant::now();

    for handle in handles {
        tokio::select! {
            result = handle => {
                match result {
                    Ok(Ok(bytes)) => {
                        *progress.write() += bytes;
                    }
                    Ok(Err(e)) => return Err(e),
                    Err(_) => return Err(DlmanError::Unknown("Task panicked".to_string())),
                }
            }
            _ = cancel_token.cancelled() => {
                return Err(DlmanError::Cancelled);
            }
        }

        // Send progress update
        if last_update.elapsed() >= std::time::Duration::from_millis(100) {
            let downloaded = *progress.read();
            let _ = event_tx.send(CoreEvent::DownloadProgress {
                id,
                downloaded,
                total: Some(total_size),
                speed: 0, // TODO: calculate actual speed
                eta: None,
            });
            last_update = std::time::Instant::now();
        }
    }

    // Merge segments into final file
    merge_segments(&segment_paths, dest_path).await?;

    // Clean up segment files
    for path in segment_paths {
        let _ = tokio::fs::remove_file(path).await;
    }

    Ok(())
}

/// Download a single segment
async fn download_segment(
    client: &Client,
    url: &str,
    path: &Path,
    segment: &Segment,
    cancel_token: CancellationToken,
) -> Result<u64, DlmanError> {
    let range = format!("bytes={}-{}", segment.start + segment.downloaded, segment.end);
    
    let response = client
        .get(url)
        .header(reqwest::header::RANGE, range)
        .send()
        .await?;

    if !response.status().is_success() && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(DlmanError::ServerError {
            status: response.status().as_u16(),
            message: response.status().to_string(),
        });
    }

    let mut stream = response.bytes_stream();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await?;

    let mut downloaded = segment.downloaded;

    while let Some(chunk_result) = tokio::select! {
        chunk = stream.next() => chunk,
        _ = cancel_token.cancelled() => {
            return Err(DlmanError::Cancelled);
        }
    } {
        let chunk = chunk_result?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
    }

    file.flush().await?;
    
    Ok(downloaded)
}

/// Calculate segment ranges for a file
fn calculate_segments(total_size: u64, num_segments: u32) -> Vec<Segment> {
    let segment_size = total_size / num_segments as u64;
    let mut segments = Vec::new();

    for i in 0..num_segments {
        let start = i as u64 * segment_size;
        let end = if i == num_segments - 1 {
            total_size - 1
        } else {
            (i + 1) as u64 * segment_size - 1
        };

        segments.push(Segment::new(i, start, end));
    }

    segments
}

/// Merge segment files into final file
async fn merge_segments(segment_paths: &[std::path::PathBuf], dest_path: &Path) -> Result<(), DlmanError> {
    let mut dest_file = File::create(dest_path).await?;

    for path in segment_paths {
        if path.exists() {
            let data = tokio::fs::read(path).await?;
            dest_file.write_all(&data).await?;
        }
    }

    dest_file.flush().await?;
    
    Ok(())
}
