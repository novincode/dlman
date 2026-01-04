//! DLMan Desktop Application
//!
//! Tauri-based desktop application for DLMan.

mod browser_server;
mod commands;
mod log_forward;
mod state;
mod window_manager;

use state::AppState;
use tauri::{Listener, Manager};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        if cfg!(debug_assertions) {
            tracing_subscriber::EnvFilter::new("debug")
        } else {
            tracing_subscriber::EnvFilter::new("info")
        }
    });

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .with(log_forward::TauriLogForwardLayer::default())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Enable forwarding Rust logs to the frontend Dev Console.
            log_forward::set_app_handle(app.handle().clone());

            // Initialize application state synchronously using block_on
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            // Create state synchronously to ensure it's ready before app starts
            let state = tauri::async_runtime::block_on(async {
                AppState::new(data_dir).await
            });

            match state {
                Ok(state) => {
                    // Start forwarding core events to frontend
                    state.start_event_forwarding(app.handle().clone());
                    
                    // Start browser integration server
                    state.start_browser_server();
                    
                    app.manage(state);
                    tracing::info!("DLMan initialized successfully");
                }
                Err(e) => {
                    tracing::error!("Failed to initialize DLMan: {}", e);
                    // Return error to prevent app from starting with broken state
                    return Err(e.to_string().into());
                }
            }

            // Handle deep links (from browser extension)
            // The deep-link plugin emits events that we listen for
            let app_handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                let urls = event.payload();
                for url in urls.lines() {
                    if let Some(path) = url.strip_prefix("dlman://") {
                        // Parse URL to extract action
                        if path.starts_with("add-download") {
                            // Extract download URL from query params if present
                            let download_url = if let Some(query_start) = path.find('?') {
                                let query = &path[query_start + 1..];
                                query
                                    .split('&')
                                    .find(|param| param.starts_with("url="))
                                    .and_then(|param| {
                                        let encoded = param.strip_prefix("url=")?;
                                        urlencoding::decode(encoded).ok().map(|s| s.to_string())
                                    })
                            } else {
                                None
                            };

                            // Show add download popup
                            if let Some(state) = app_handle.try_state::<AppState>() {
                                let _ = state.window_manager.show_add_download_popup(&app_handle, download_url);
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Download commands
            commands::add_download,
            commands::add_downloads_batch,
            commands::pause_download,
            commands::resume_download,
            commands::retry_download,
            commands::cancel_download,
            commands::delete_download,
            commands::update_download,
            commands::get_downloads,
            commands::probe_links,
            // Queue commands
            commands::get_queues,
            commands::create_queue,
            commands::update_queue,
            commands::delete_queue,
            commands::start_queue,
            commands::stop_queue,
            commands::get_queue_schedules,
            // Settings commands
            commands::get_settings,
            commands::update_settings,
            // Data commands
            commands::export_data,
            commands::import_data,
            // File system commands
            commands::show_in_folder,
            commands::open_folder,
            commands::open_file,
            commands::delete_file_only,
            commands::file_exists,
            commands::execute_post_action,
            // Window commands
            commands::show_add_download_popup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
