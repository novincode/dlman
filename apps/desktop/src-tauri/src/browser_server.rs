//! Browser Extension Integration Server
//!
//! HTTP + WebSocket server for browser extension communication.
//! Runs on localhost:<port> (default 7899).
//!
//! Architecture:
//! - HTTP REST is the PRIMARY transport (always reliable if server is up)
//! - WebSocket is OPTIONAL for real-time progress events only
//! - No deep links, no protocol handlers — just direct HTTP calls

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
use dlman_types::{CoreEvent, Download, Queue};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, RwLock};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

// ============================================================================
// Request/Response types
// ============================================================================

/// Request to add a new download from the browser extension
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddDownloadRequest {
    pub url: String,
    pub filename: Option<String>,
    pub destination: Option<String>,
    pub queue_id: Option<String>,
    pub referrer: Option<String>,
    pub cookies: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    #[serde(default = "default_auto_start")]
    pub auto_start: bool,
}

fn default_auto_start() -> bool {
    true
}

/// Response after adding a download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddDownloadResponse {
    pub success: bool,
    pub download: Option<Download>,
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
// Browser Server
// ============================================================================

pub struct BrowserServer {
    core: DlmanCore,
    port: u16,
    shutdown_tx: Option<broadcast::Sender<()>>,
}

impl BrowserServer {
    pub fn new(core: DlmanCore, port: u16) -> Self {
        Self {
            core,
            port,
            shutdown_tx: None,
        }
    }

    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let (shutdown_tx, _) = broadcast::channel::<()>(1);
        self.shutdown_tx = Some(shutdown_tx.clone());

        let core = self.core.clone();
        let shared_state = Arc::new(RwLock::new(core));

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

        let app = Router::new()
            // Health check — extension pings this to check if app is running
            .route("/ping", get(|| async { "pong" }))
            // REST API
            .route("/api/status", get(handle_status))
            .route("/api/queues", get(handle_get_queues))
            .route("/api/downloads", get(handle_get_downloads))
            .route("/api/downloads", post(handle_add_download))
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

type SharedState = Arc<RwLock<DlmanCore>>;

async fn handle_status(
    State(state): axum::extract::State<SharedState>,
) -> impl axum::response::IntoResponse {
    let core = state.read().await;
    let downloads = core.get_all_downloads().await.unwrap_or_default();
    let queues = core.get_queues().await;

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
    let core = state.read().await;
    let queues = core.get_queues().await;
    axum::Json(queues)
}

async fn handle_get_downloads(
    State(state): axum::extract::State<SharedState>,
) -> impl axum::response::IntoResponse {
    let core = state.read().await;
    match core.get_all_downloads().await {
        Ok(downloads) => axum::Json(downloads),
        Err(_) => axum::Json(Vec::<Download>::new()),
    }
}

async fn handle_add_download(
    State(state): axum::extract::State<SharedState>,
    axum::Json(req): axum::Json<AddDownloadRequest>,
) -> impl axum::response::IntoResponse {
    let core = state.write().await;

    let queue_id = req
        .queue_id
        .and_then(|s| Uuid::parse_str(&s).ok())
        .unwrap_or(Uuid::nil());

    let settings = core.get_settings().await;
    let destination = req
        .destination
        .map(std::path::PathBuf::from)
        .unwrap_or(settings.default_download_path);

    match core
        .add_download(&req.url, destination, queue_id, None)
        .await
    {
        Ok(download) => axum::Json(AddDownloadResponse {
            success: true,
            download: Some(download),
            error: None,
        }),
        Err(e) => axum::Json(AddDownloadResponse {
            success: false,
            download: None,
            error: Some(e.to_string()),
        }),
    }
}

async fn handle_pause_download(
    State(state): axum::extract::State<SharedState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl axum::response::IntoResponse {
    let Ok(uuid) = Uuid::parse_str(&id) else {
        return axum::Json(ControlResponse {
            success: false,
            error: Some("Invalid download ID".to_string()),
        });
    };

    let core = state.write().await;
    match core.pause_download(uuid).await {
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
    let Ok(uuid) = Uuid::parse_str(&id) else {
        return axum::Json(ControlResponse {
            success: false,
            error: Some("Invalid download ID".to_string()),
        });
    };

    let core = state.write().await;
    match core.resume_download(uuid).await {
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
    let Ok(uuid) = Uuid::parse_str(&id) else {
        return axum::Json(ControlResponse {
            success: false,
            error: Some("Invalid download ID".to_string()),
        });
    };

    let core = state.write().await;
    match core.cancel_download(uuid).await {
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
    let core = state.read().await;
    let mut event_rx = core.subscribe();
    drop(core);

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
