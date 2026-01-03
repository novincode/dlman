//! Tauri commands for the desktop application

use crate::state::AppState;
use dlman_types::{Download, LinkInfo, Queue, QueueOptions, Settings};
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

// ============================================================================
// Download Commands
// ============================================================================

/// Optional pre-probed info from batch import
#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct ProbedInfo {
    pub filename: Option<String>,
    pub size: Option<u64>,
    pub final_url: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn add_download(
    state: State<'_, AppState>,
    url: String,
    destination: String,
    queue_id: String,
    category_id: Option<String>,
    probed_info: Option<ProbedInfo>,
) -> Result<Download, String> {
    let queue_uuid = Uuid::parse_str(&queue_id).map_err(|e| e.to_string())?;
    let category_uuid = category_id.map(|s| Uuid::parse_str(&s).map_err(|e| e.to_string())).transpose()?;
    let dest_path = PathBuf::from(destination);

    state
        .with_core_async(|core| async move { 
            let mut download = core.add_download(&url, dest_path, queue_uuid, category_uuid).await?;
            
            // Apply probed info if provided (from batch import)
            if let Some(info) = probed_info {
                let mut updated = false;
                if let Some(filename) = info.filename {
                    download.filename = filename;
                    updated = true;
                }
                if let Some(size) = info.size {
                    download.size = Some(size);
                    updated = true;
                }
                if let Some(final_url) = info.final_url {
                    download.final_url = Some(final_url);
                    updated = true;
                }
                if updated {
                    core.download_manager.db().upsert_download(&download).await?;
                }
            }
            
            Ok(download)
        })
        .await
}

/// Request for batch adding downloads
#[derive(serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BatchDownloadRequest {
    pub url: String,
    pub probed_info: Option<ProbedInfo>,
}

/// Add multiple downloads at once (batch import)
#[tauri::command(rename_all = "snake_case")]
pub async fn add_downloads_batch(
    state: State<'_, AppState>,
    downloads: Vec<BatchDownloadRequest>,
    destination: String,
    queue_id: String,
    category_id: Option<String>,
) -> Result<Vec<Download>, String> {
    let queue_uuid = Uuid::parse_str(&queue_id).map_err(|e| e.to_string())?;
    let category_uuid = category_id.map(|s| Uuid::parse_str(&s).map_err(|e| e.to_string())).transpose()?;
    let dest_path = PathBuf::from(destination);

    state
        .with_core_async(|core| async move {
            let mut results = Vec::with_capacity(downloads.len());
            
            for req in downloads {
                match core.add_download(&req.url, dest_path.clone(), queue_uuid, category_uuid).await {
                    Ok(mut download) => {
                        // Apply probed info if provided
                        if let Some(info) = req.probed_info {
                            let mut updated = false;
                            if let Some(filename) = info.filename {
                                download.filename = filename;
                                updated = true;
                            }
                            if let Some(size) = info.size {
                                download.size = Some(size);
                                updated = true;
                            }
                            if let Some(final_url) = info.final_url {
                                download.final_url = Some(final_url);
                                updated = true;
                            }
                            if updated {
                                core.download_manager.db().upsert_download(&download).await?;
                            }
                        }
                        results.push(download);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to add download {}: {}", req.url, e);
                        // Continue with other downloads
                    }
                }
            }
            
            Ok(results)
        })
        .await
}

#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.pause_download(uuid).await })
        .await
}

#[tauri::command]
pub async fn resume_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.resume_download(uuid).await })
        .await
}

#[tauri::command]
pub async fn retry_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.retry_download(uuid).await })
        .await
}

#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.cancel_download(uuid).await })
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_download(
    state: State<'_, AppState>,
    id: String,
    delete_file: bool,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.delete_download(uuid, delete_file).await })
        .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DownloadUpdates {
    pub speed_limit: Option<Option<u64>>,
    pub category_id: Option<Option<String>>,
}

#[tauri::command]
pub async fn update_download(
    state: State<'_, AppState>,
    id: String,
    updates: DownloadUpdates,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move {
            // Update speed limit for running downloads
            if let Some(speed_limit) = updates.speed_limit {
                core.update_download_speed_limit(uuid, speed_limit).await?;
            }

            // Update category in database
            if let Some(category_id) = updates.category_id {
                let mut download = core.get_download(uuid).await?;
                download.category_id = category_id.map(|s| Uuid::parse_str(&s)).transpose().unwrap_or(None);
                core.download_manager.db().upsert_download(&download).await?;
            }
            Ok(())
        })
        .await
}

#[tauri::command]
pub async fn get_downloads(state: State<'_, AppState>) -> Result<Vec<Download>, String> {
    state
        .with_core_async(|core| async move { core.get_all_downloads().await })
        .await
}

#[tauri::command]
pub async fn probe_links(
    state: State<'_, AppState>,
    urls: Vec<String>,
) -> Result<Vec<LinkInfo>, String> {
    state
        .with_core_async(|core| async move { Ok(core.probe_links(urls).await) })
        .await
}

// ============================================================================
// Queue Commands
// ============================================================================

#[tauri::command]
pub async fn get_queues(state: State<'_, AppState>) -> Result<Vec<Queue>, String> {
    state
        .with_core_async(|core| async move { Ok(core.get_queues().await) })
        .await
}

#[tauri::command]
pub async fn create_queue(
    state: State<'_, AppState>,
    name: String,
    options: QueueOptions,
) -> Result<Queue, String> {
    state
        .with_core_async(|core| async move { core.create_queue(&name, options).await })
        .await
}

#[tauri::command]
pub async fn update_queue(
    state: State<'_, AppState>,
    id: String,
    options: QueueOptions,
) -> Result<Queue, String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.update_queue(uuid, options).await })
        .await
}

#[tauri::command]
pub async fn delete_queue(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.delete_queue(uuid).await })
        .await
}

#[tauri::command]
pub async fn start_queue(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.start_queue(uuid).await })
        .await
}

#[tauri::command]
pub async fn stop_queue(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.stop_queue(uuid).await })
        .await
}

// ============================================================================
// Settings Commands
// ============================================================================

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    state
        .with_core_async(|core| async move { Ok(core.get_settings().await) })
        .await
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    tracing::info!("update_settings called with default_segments={}", settings.default_segments);
    state
        .with_core_async(|core| async move { core.update_settings(settings).await })
        .await
}

// ============================================================================
// Data Commands
// ============================================================================

#[tauri::command]
pub async fn export_data(state: State<'_, AppState>) -> Result<String, String> {
    state
        .with_core_async(|core| async move { core.export_data().await })
        .await
}

#[tauri::command]
pub async fn import_data(state: State<'_, AppState>, data: String) -> Result<(), String> {
    state
        .with_core_async(|core| async move { core.import_data(&data).await })
        .await
}

// ============================================================================
// File System Commands
// ============================================================================

#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    
    // Ensure path exists, if not try parent
    let path_to_show = if path.exists() {
        path.clone()
    } else if let Some(parent) = path.parent() {
        if parent.exists() {
            parent.to_path_buf()
        } else {
            return Err(format!("Path does not exist: {}", path.display()));
        }
    } else {
        return Err(format!("Path does not exist: {}", path.display()));
    };
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path_to_show)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        // On Windows, use /select with proper escaping
        let path_str = path_to_show.to_string_lossy().replace('/', "\\");
        std::process::Command::new("explorer")
            .args(["/select,", &path_str])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // Try xdg-open on the parent directory
        if let Some(parent) = path_to_show.parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    
    // Ensure path exists
    if !path.exists() {
        // Try to create the directory if it doesn't exist
        std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    // Ensure we're opening a directory, not a file
    let folder_path = if path.is_file() {
        path.parent().unwrap_or(&path).to_path_buf()
    } else {
        path.clone()
    };
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        // Convert forward slashes to backslashes for Windows
        let path_str = folder_path.to_string_lossy().replace('/', "\\");
        std::process::Command::new("explorer")
            .arg(&path_str)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn delete_file_only(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    let path = PathBuf::from(&path);
    Ok(path.exists())
}


