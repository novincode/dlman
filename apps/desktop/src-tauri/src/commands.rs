//! Tauri commands for the desktop application

use crate::state::AppState;
use dlman_types::{Download, LinkInfo, Queue, QueueOptions, Settings};
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

// ============================================================================
// Download Commands
// ============================================================================

#[tauri::command]
pub async fn add_download(
    state: State<'_, AppState>,
    url: String,
    destination: String,
    queue_id: String,
    category_id: Option<String>,
) -> Result<Download, String> {
    let queue_uuid = Uuid::parse_str(&queue_id).map_err(|e| e.to_string())?;
    let category_uuid = category_id.map(|s| Uuid::parse_str(&s).map_err(|e| e.to_string())).transpose()?;
    let dest_path = PathBuf::from(destination);

    state
        .with_core_async(|core| async move { core.add_download(&url, dest_path, queue_uuid, category_uuid).await })
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
pub async fn cancel_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .with_core_async(|core| async move { core.cancel_download(uuid).await })
        .await
}

#[tauri::command]
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

            // Update other fields in memory
            let mut downloads = core.downloads.write().await;
            if let Some(download) = downloads.get_mut(&uuid) {
                if let Some(category_id) = updates.category_id {
                    download.category_id = category_id.map(|s| Uuid::parse_str(&s)).transpose().unwrap_or(None);
                }
            }
            Ok(())
        })
        .await
}

#[tauri::command]
pub async fn get_downloads(state: State<'_, AppState>) -> Result<Vec<Download>, String> {
    state
        .with_core_async(|core| async move {
            let downloads = core.downloads.read().await;
            Ok(downloads.values().cloned().collect())
        })
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
        .with_core_async(|core| async move {
            let queues = core.queues.read().await;
            Ok(queues.values().cloned().collect())
        })
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
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // Try xdg-open on the parent directory
        if let Some(parent) = path.parent() {
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
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
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


