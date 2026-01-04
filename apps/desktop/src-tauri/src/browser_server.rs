//! Browser Extension Integration Server
//!
//! Provides HTTP and WebSocket endpoints for browser extension communication.
//! Runs on localhost:<browser_integration_port> (default 7899).

use axum::{
    extract::{ws::{Message, WebSocket}, State, WebSocketUpgrade},
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
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

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
}

/// Response after adding a download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddDownloadResponse {
    pub success: bool,
    pub download: Option<Download>,
    pub error: Option<String>,
}

/// Status response for browser extension
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusResponse {
    pub connected: bool,
    pub version: String,
    pub active_downloads: usize,
    pub queues: usize,
}

/// WebSocket message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
#[serde(rename_all = "snake_case")]
pub enum WsMessage {
    // Requests
    Ping,
    GetStatus,
    GetQueues,
    GetDownloads,
    AddDownload(AddDownloadRequest),
    
    // Responses
    Pong,
    Status(StatusResponse),
    QueuesList(Vec<Queue>),
    DownloadsList(Vec<Download>),
    DownloadAdded(AddDownloadResponse),
    
    // Events (broadcast)
    DownloadProgress {
        id: String,
        downloaded: u64,
        total: Option<u64>,
        speed: u64,
        eta: Option<u64>,
    },
    DownloadCompleted {
        id: String,
    },
    Error {
        message: String,
    },
}

/// Message wrapper with ID for request/response matching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiMessage {
    pub id: String,
    #[serde(flatten)]
    pub message: WsMessage,
    pub timestamp: u64,
}

/// Browser integration server state
pub struct BrowserServer {
    core: DlmanCore,
    port: u16,
    shutdown_tx: Option<broadcast::Sender<()>>,
}

impl BrowserServer {
    /// Create a new browser integration server
    pub fn new(core: DlmanCore, port: u16) -> Self {
        Self {
            core,
            port,
            shutdown_tx: None,
        }
    }

    /// Start the HTTP/WebSocket server
    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let (shutdown_tx, _) = broadcast::channel::<()>(1);
        self.shutdown_tx = Some(shutdown_tx.clone());

        let core = self.core.clone();
        let shared_state = Arc::new(RwLock::new(core));

        // CORS configuration for browser extension
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

        // Build router
        let app = Router::new()
            // Health check
            .route("/ping", get(|| async { "pong" }))
            // REST API
            .route("/api/status", get(handle_status))
            .route("/api/queues", get(handle_get_queues))
            .route("/api/downloads", get(handle_get_downloads))
            .route("/api/downloads", post(handle_add_download))
            // Download control endpoints
            .route("/api/downloads/:id/pause", post(handle_pause_download))
            .route("/api/downloads/:id/resume", post(handle_resume_download))
            .route("/api/downloads/:id/cancel", post(handle_cancel_download))
            // WebSocket
            .route("/ws", get(handle_websocket))
            .layer(cors)
            .with_state(shared_state);

        // Bind to localhost only for security
        let addr = SocketAddr::from(([127, 0, 0, 1], self.port));
        tracing::info!("Browser integration server starting on http://{}", addr);

        let listener = tokio::net::TcpListener::bind(addr).await?;
        
        // Run server with graceful shutdown
        let mut shutdown_rx = shutdown_tx.subscribe();
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.recv().await;
            })
            .await?;

        Ok(())
    }

    /// Stop the server
    pub fn stop(&self) {
        if let Some(tx) = &self.shutdown_tx {
            let _ = tx.send(());
        }
    }
}

// HTTP Handler implementations
type SharedState = Arc<RwLock<DlmanCore>>;

async fn handle_status(
    State(state): axum::extract::State<SharedState>,
) -> impl axum::response::IntoResponse {
    let core = state.read().await;
    let downloads = core.get_all_downloads().await.unwrap_or_default();
    let queues = core.get_queues().await;
    
    let active = downloads.iter().filter(|d| {
        matches!(d.status, dlman_types::DownloadStatus::Downloading | dlman_types::DownloadStatus::Pending)
    }).count();

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
    
    let queue_id = req.queue_id
        .and_then(|s| Uuid::parse_str(&s).ok())
        .unwrap_or(Uuid::nil()); // Default queue
    
    let settings = core.get_settings().await;
    let destination = req.destination
        .map(std::path::PathBuf::from)
        .unwrap_or(settings.default_download_path);

    match core.add_download(&req.url, destination, queue_id, None).await {
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

/// Simple response for control operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponse {
    pub success: bool,
    pub error: Option<String>,
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
        Ok(_) => axum::Json(ControlResponse { success: true, error: None }),
        Err(e) => axum::Json(ControlResponse { success: false, error: Some(e.to_string()) }),
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
        Ok(_) => axum::Json(ControlResponse { success: true, error: None }),
        Err(e) => axum::Json(ControlResponse { success: false, error: Some(e.to_string()) }),
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
        Ok(_) => axum::Json(ControlResponse { success: true, error: None }),
        Err(e) => axum::Json(ControlResponse { success: false, error: Some(e.to_string()) }),
    }
}

async fn handle_websocket(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_ws_connection(socket, state))
}

async fn handle_ws_connection(socket: WebSocket, state: SharedState) {
    let (mut sender, mut receiver) = socket.split();
    
    // Subscribe to core events
    let core = state.read().await;
    let mut event_rx = core.subscribe();
    drop(core);

    // Spawn task to forward core events to WebSocket
    // Note: In production, we'd use a channel to send events to the WebSocket sender
    let forward_task = tokio::spawn(async move {
        while let Ok(event) = event_rx.recv().await {
            let ws_msg = match event {
                CoreEvent::DownloadProgress { id, downloaded, total, speed, eta } => {
                    Some(WsMessage::DownloadProgress {
                        id: id.to_string(),
                        downloaded,
                        total,
                        speed,
                        eta,
                    })
                }
                CoreEvent::DownloadStatusChanged { id, status, .. } => {
                    if matches!(status, dlman_types::DownloadStatus::Completed) {
                        Some(WsMessage::DownloadCompleted { id: id.to_string() })
                    } else {
                        None
                    }
                }
                CoreEvent::Error { message, .. } => {
                    Some(WsMessage::Error { message })
                }
                _ => None,
            };

            if let Some(msg) = ws_msg {
                let _api_msg = ApiMessage {
                    id: format!("evt_{}", uuid::Uuid::new_v4()),
                    message: msg,
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                };
                
                // TODO: Use mpsc channel to forward events to WebSocket sender
                // Currently events are logged but not sent due to socket split
            }
        }
    });

    // Handle incoming messages
    while let Some(result) = receiver.next().await {
        match result {
            Ok(Message::Text(text)) => {
                if let Ok(api_msg) = serde_json::from_str::<ApiMessage>(&text) {
                    let response = handle_ws_message(api_msg.clone(), state.clone()).await;
                    if let Ok(json) = serde_json::to_string(&response) {
                        if sender.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }

    forward_task.abort();
}

async fn handle_ws_message(msg: ApiMessage, state: SharedState) -> ApiMessage {
    let response_msg = match msg.message {
        WsMessage::Ping => WsMessage::Pong,
        
        WsMessage::GetStatus => {
            let core = state.read().await;
            let downloads = core.get_all_downloads().await.unwrap_or_default();
            let queues = core.get_queues().await;
            let active = downloads.iter().filter(|d| {
                matches!(d.status, dlman_types::DownloadStatus::Downloading | dlman_types::DownloadStatus::Pending)
            }).count();
            
            WsMessage::Status(StatusResponse {
                connected: true,
                version: env!("CARGO_PKG_VERSION").to_string(),
                active_downloads: active,
                queues: queues.len(),
            })
        }
        
        WsMessage::GetQueues => {
            let core = state.read().await;
            WsMessage::QueuesList(core.get_queues().await)
        }
        
        WsMessage::GetDownloads => {
            let core = state.read().await;
            WsMessage::DownloadsList(core.get_all_downloads().await.unwrap_or_default())
        }
        
        WsMessage::AddDownload(req) => {
            let core = state.write().await;
            let queue_id = req.queue_id
                .and_then(|s| Uuid::parse_str(&s).ok())
                .unwrap_or(Uuid::nil());
            let settings = core.get_settings().await;
            let destination = req.destination
                .map(std::path::PathBuf::from)
                .unwrap_or(settings.default_download_path);

            match core.add_download(&req.url, destination, queue_id, None).await {
                Ok(download) => WsMessage::DownloadAdded(AddDownloadResponse {
                    success: true,
                    download: Some(download),
                    error: None,
                }),
                Err(e) => WsMessage::DownloadAdded(AddDownloadResponse {
                    success: false,
                    download: None,
                    error: Some(e.to_string()),
                }),
            }
        }
        
        // For response types, just echo back (shouldn't happen in normal flow)
        other => other,
    };

    ApiMessage {
        id: msg.id,
        message: response_msg,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    }
}
