//! DLMan Desktop Application
//!
//! Tauri-based desktop application for DLMan.

mod commands;
mod log_forward;
mod state;

use state::AppState;
use tauri::Manager;
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
                    
                    app.manage(state);
                    tracing::info!("DLMan initialized successfully");
                }
                Err(e) => {
                    tracing::error!("Failed to initialize DLMan: {}", e);
                    // Return error to prevent app from starting with broken state
                    return Err(e.to_string().into());
                }
            }

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
