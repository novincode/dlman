//! Browser Extension Integration Server
//!
//! HTTP + WebSocket server for browser extension communication.
//! Runs on localhost:<port> (default 7899).
//!
//! Architecture:
//! - HTTP REST is the PRIMARY transport (always reliable if server is up)
//! - WebSocket is OPTIONAL for real-time progress events only
//! - No deep links, no protocol handlers — just direct HTTP calls
//! - Extension sends URLs → server emits Tauri events → frontend opens dialogs

use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    http::{header, Method},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use dlman_core::DlmanCore;
use dlman_types::{CoreEvent, Download};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{broadcast, mpsc, RwLock};
use tower_http::cors::{Any, CorsLayer};

// ============================================================================
// Request/Response types
// ============================================================================

/// Request to show the download dialog (single URL)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShowDialogRequest {
    pub url: String,
    pub referrer: Option<String>,
    pub filename: Option<String>,
    pub cookies: Option<String>,
}

/// Request to show the batch download dialog (multiple URLs)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShowBatchDialogRequest {
    pub urls: Vec<String>,
    pub referrer: Option<String>,
}

/// Response after requesting a dialog
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShowDialogResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Status response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusResponse {
    pub connected: bool,
    pub version: String,
    pub active_downloads: usize,
    pub queues: usize,
}

/// Simple response for control operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponse {
    pub success: bool,
    pub error: Option<String>,
}

// ============================================================================
// WebSocket message types (simple JSON — no tagged enums, no flattening)
// ============================================================================

/// Outbound WS event sent from server → extension
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downloaded: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

// ============================================================================
// Shared state — holds DlmanCore + Tauri AppHandle
// ============================================================================

pub struct ServerState {
    pub core: DlmanCore,
    pub app_handle: AppHandle,
}

// ============================================================================
// Browser Server
// ============================================================================

pub struct BrowserServer {
    core: DlmanCore,
    app_handle: AppHandle,
    port: u16,
    shutdown_tx: Option<broadcast::Sender<()>>,
}

impl BrowserServer {
    pub fn new(core: DlmanCore, app_handle: AppHandle, port: u16) -> Self {
        Self {
            core,
            app_handle,
            port,
            shutdown_tx: None,
        }
    }

    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let (shutdown_tx, _) = broadcast::channel::<()>(1);
        self.shutdown_tx = Some(shutdown_tx.clone());

        let shared_state = Arc::new(RwLock::new(ServerState {
            core: self.core.clone(),
            app_handle: self.app_handle.clone(),
        }));

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

        let app = Router::new()
            // Health check — extension pings this to check if app is running
            .route("/ping", get(|| async { "pong" }))
            // Dialog endpoints — extension sends URLs, app shows dialogs
            .route("/api/show-dialog", post(handle_show_dialog))
            .route("/api/show-dialog/batch", post(handle_show_batch_dialog))
            // REST API (data queries, download control)
            .route("/api/status", get(handle_status))
            .route("/api/queues", get(handle_get_queues))
            .route("/api/downloads", get(handle_get_downloads))
            // Download control
            .route("/api/downloads/:id/pause", post(handle_pause_download))
            .route("/api/downloads/:id/resume", post(handle_resume_download))
            .route("/api/downloads/:id/cancel", post(handle_cancel_download))
            // WebSocket for real-time events (optional)
            .route("/ws", get(handle_websocket))
            .layer(cors)
            .with_state(shared_state);

        let addr = SocketAddr::from(([127, 0, 0, 1], self.port));
        tracing::info!("Browser integration server starting on http://{}", addr);

        let listener = tokio::net::TcpListener::bind(addr).await?;

        let mut shutdown_rx = shutdown_tx.subscribe();
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.recv().await;
            })
            .await?;

        Ok(())
    }

    pub fn stop(&self) {
        if let Some(tx) = &self.shutdown_tx {
            let _ = tx.send(());
        }
    }
}

// ============================================================================
// HTTP Handlers
// ============================================================================

type SharedState = Arc<RwLock<ServerState>>;

/// Helper: bring the app window to attention (dock bounce on macOS, taskbar flash on Windows)
fn request_attention(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        // Show the window if hidden
        let _ = window.show();
        let _ = window.unminimize();
        // Request user attention (bounces dock icon on macOS, flashes taskbar on Windows)
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
}

/// POST /api/show-dialog — single download dialog
async fn handle_show_dialog(
    State(state): axum::extract::State<SharedState>,
    axum::Json(req): axum::Json<ShowDialogRequest>,
) -> impl axum::response::IntoResponse {
    let state = state.read().await;
    let app_handle = &state.app_handle;

    // Emit event to frontend with the full request (url, referrer, filename, cookies)
    let payload = serde_json::json!({
        "url": req.url,
        "referrer": req.referrer,
        "filename": req.filename,
        "cookies": req.cookies,
    });
    if let Err(e) = app_handle.emit("show-new-download-dialog", payload) {
        tracing::error!("Failed to emit show-new-download-dialog: {}", e);
        return axum::Json(ShowDialogResponse {
            success: false,
            error: Some(format!("Failed to open dialog: {}", e)),
        });
    }

    // Bounce dock / flash taskbar
    request_attention(app_handle);

    axum::Json(ShowDialogResponse {
        success: true,
        error: None,
    })
}

/// POST /api/show-dialog/batch — bulk download dialog
async fn handle_show_batch_dialog(
    State(state): axum::extract::State<SharedState>,
    axum::Json(req): axum::Json<ShowBatchDialogRequest>,
) -> impl axum::response::IntoResponse {
    let state = state.read().await;
    let app_handle = &state.app_handle;

    if req.urls.is_empty() {
        return axum::Json(ShowDialogResponse {
            success: false,
            error: Some("No URLs provided".to_string()),
        });
    }

    // If single URL, use the single dialog
    if req.urls.len() == 1 {
        let payload = serde_json::json!({
            "url": req.urls[0],
            "referrer": req.referrer,
        });
        if let Err(e) = app_handle.emit("show-new-download-dialog", payload) {
            tracing::error!("Failed to emit show-new-download-dialog: {}", e);
            return axum::Json(ShowDialogResponse {
                success: false,
                error: Some(format!("Failed to open dialog: {}", e)),
            });
        }
    } else {
        // Multiple URLs → batch dialog
        let payload = serde_json::json!(req.urls);
        if let Err(e) = app_handle.emit("show-batch-download-dialog", payload) {
            tracing::error!("Failed to emit show-batch-download-dialog: {}", e);
            return axum::Json(ShowDialogResponse {
                success: false,
                error: Some(format!("Failed to open dialog: {}", e)),
            });
        }
    }

    // Bounce dock / flash taskbar
    request_attention(app_handle);

    axum::Json(ShowDialogResponse {
        success: true,
        error: None,
    })
}

async fn handle_status(
    State(state): axum::extract::State<SharedState>,
) -> impl axum::response::IntoResponse {
    let state = state.read().await;
    let downloads = state.core.get_all_downloads().await.unwrap_or_default();
    let queues = state.core.get_queues().await;

    let active = downloads
        .iter()
        .filter(|d| {
            matches!(
                d.status,
                dlman_types::DownloadStatus::Downloading | dlman_types::DownloadStatus::Pending
            )
        })
        .count();

    axum::Json(StatusResponse {
        connected: true,
        version: env!("CARGO_PKG_VERSION").to_string(),
        active_downloads: active,
        queues: queues.len(),
    })
}

async fn handle_get_queues(
    State(state): axum::extract::State<SharedState>,
) -> impl axum::response::IntoResponse {
    let state = state.read().await;
    let queues = state.core.get_queues().await;
    axum::Json(queues)
}

async fn handle_get_downloads(
    State(state): axum::extract::State<SharedState>,
) -> impl axum::response::IntoResponse {
    let state = state.read().await;
    match state.core.get_all_downloads().await {
        Ok(downloads) => axum::Json(downloads),
        Err(_) => axum::Json(Vec::<Download>::new()),
    }
}

async fn handle_pause_download(
    State(state): axum::extract::State<SharedState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl axum::response::IntoResponse {
    let Ok(uuid) = uuid::Uuid::parse_str(&id) else {
        return axum::Json(ControlResponse {
            success: false,
            error: Some("Invalid download ID".to_string()),
        });
    };

    let state = state.write().await;
    match state.core.pause_download(uuid).await {
        Ok(_) => axum::Json(ControlResponse {
            success: true,
            error: None,
        }),
        Err(e) => axum::Json(ControlResponse {
            success: false,
            error: Some(e.to_string()),
        }),
    }
}

async fn handle_resume_download(
    State(state): axum::extract::State<SharedState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl axum::response::IntoResponse {
    let Ok(uuid) = uuid::Uuid::parse_str(&id) else {
        return axum::Json(ControlResponse {
            success: false,
            error: Some("Invalid download ID".to_string()),
        });
    };

    let state = state.write().await;
    match state.core.resume_download(uuid).await {
        Ok(_) => axum::Json(ControlResponse {
            success: true,
            error: None,
        }),
        Err(e) => axum::Json(ControlResponse {
            success: false,
            error: Some(e.to_string()),
        }),
    }
}

async fn handle_cancel_download(
    State(state): axum::extract::State<SharedState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl axum::response::IntoResponse {
    let Ok(uuid) = uuid::Uuid::parse_str(&id) else {
        return axum::Json(ControlResponse {
            success: false,
            error: Some("Invalid download ID".to_string()),
        });
    };

    let state = state.write().await;
    match state.core.cancel_download(uuid).await {
        Ok(_) => axum::Json(ControlResponse {
            success: true,
            error: None,
        }),
        Err(e) => axum::Json(ControlResponse {
            success: false,
            error: Some(e.to_string()),
        }),
    }
}

// ============================================================================
// WebSocket — real-time event streaming only
// ============================================================================

async fn handle_websocket(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_ws_connection(socket, state))
}

async fn handle_ws_connection(socket: WebSocket, state: SharedState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Create an mpsc channel so the event-forwarding task can send to the WS sender
    let (tx, mut rx) = mpsc::channel::<String>(128);

    // Task 1: Drain mpsc → WebSocket sender
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Task 2: Forward core events → mpsc channel
    let server_state = state.read().await;
    let mut event_rx = server_state.core.subscribe();
    drop(server_state);

    let event_tx = tx.clone();
    let forward_task = tokio::spawn(async move {
        while let Ok(event) = event_rx.recv().await {
            let ws_event = match &event {
                CoreEvent::DownloadProgress {
                    id,
                    downloaded,
                    total,
                    speed,
                    eta,
                } => Some(WsEvent {
                    event_type: "progress".to_string(),
                    id: Some(id.to_string()),
                    downloaded: Some(*downloaded),
                    total: *total,
                    speed: Some(*speed),
                    eta: *eta,
                    status: None,
                    message: None,
                }),
                CoreEvent::DownloadStatusChanged { id, status, error } => Some(WsEvent {
                    event_type: "status_changed".to_string(),
                    id: Some(id.to_string()),
                    downloaded: None,
                    total: None,
                    speed: None,
                    eta: None,
                    status: Some(format!("{:?}", status).to_lowercase()),
                    message: error.clone(),
                }),
                CoreEvent::DownloadAdded { download } => Some(WsEvent {
                    event_type: "download_added".to_string(),
                    id: Some(download.id.to_string()),
                    downloaded: None,
                    total: download.size,
                    speed: None,
                    eta: None,
                    status: Some(format!("{:?}", download.status).to_lowercase()),
                    message: Some(download.filename.clone()),
                }),
                CoreEvent::Error { message, .. } => Some(WsEvent {
                    event_type: "error".to_string(),
                    id: None,
                    downloaded: None,
                    total: None,
                    speed: None,
                    eta: None,
                    status: None,
                    message: Some(message.clone()),
                }),
                _ => None,
            };

            if let Some(evt) = ws_event {
                if let Ok(json) = serde_json::to_string(&evt) {
                    if event_tx.send(json).await.is_err() {
                        break; // WS closed
                    }
                }
            }
        }
    });

    // Task 3: Handle incoming WS messages (ping/pong keepalive only)
    let ping_tx = tx.clone();
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(Message::Text(text)) => {
                // Simple ping/pong for keepalive
                let text_str: &str = &text;
                if text_str.trim() == "\"ping\"" || text_str.trim() == "ping" {
                    let _ = ping_tx.send("\"pong\"".to_string()).await;
                }
                // All other operations go through HTTP REST — WS is events-only
            }
            Ok(Message::Ping(data)) => {
                let _ = ping_tx.send(String::from_utf8_lossy(&data).to_string()).await;
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }

    // Cleanup
    forward_task.abort();
    send_task.abort();
}
