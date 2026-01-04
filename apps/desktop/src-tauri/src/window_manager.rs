//! Window management for DLMan
//!
//! Handles creation and management of popup windows for browser integration

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use std::sync::Mutex;
use std::collections::HashMap;

/// Window manager for tracking popup windows
pub struct WindowManager {
    windows: Mutex<HashMap<String, String>>,
}

impl WindowManager {
    pub fn new() -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
        }
    }

    /// Create or focus a popup window for adding a new download
    pub fn show_add_download_popup(
        &self,
        app_handle: &AppHandle,
        url: Option<String>,
    ) -> Result<(), String> {
        let window_label = "add-download-popup";
        
        // Check if window already exists
        if let Some(window) = app_handle.get_webview_window(window_label) {
            // Focus existing window
            window.set_focus().map_err(|e| e.to_string())?;
            
            // Send URL to existing window if provided
            if let Some(url) = url {
                window.emit("set-download-url", url).map_err(|e| e.to_string())?;
            }
            
            return Ok(());
        }

        // Create new popup window
        let builder = WebviewWindowBuilder::new(
            app_handle,
            window_label,
            WebviewUrl::App("index.html".into()),
        )
        .title("Add Download - DLMan")
        .inner_size(550.0, 650.0)
        .min_inner_size(500.0, 600.0)
        .resizable(true)
        .center()
        .focused(true)
        .skip_taskbar(false)
        .always_on_top(true);

        let window = builder.build().map_err(|e| e.to_string())?;

        // Store window reference
        self.windows.lock().unwrap().insert(window_label.to_string(), window_label.to_string());

        // Send URL after window is ready
        if let Some(url) = url {
            // Give window time to initialize
            let window_clone = window.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                let _ = window_clone.emit("set-download-url", url);
            });
        }

        Ok(())
    }

    /// Close a popup window by label
    pub fn close_popup(&self, app_handle: &AppHandle, label: &str) -> Result<(), String> {
        if let Some(window) = app_handle.get_webview_window(label) {
            window.close().map_err(|e| e.to_string())?;
            self.windows.lock().unwrap().remove(label);
        }
        Ok(())
    }
}

impl Default for WindowManager {
    fn default() -> Self {
        Self::new()
    }
}
