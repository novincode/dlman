//! Error types for DLMan core

use thiserror::Error;
use uuid::Uuid;

/// Errors that can occur in DLMan core
#[derive(Debug, Error)]
pub enum DlmanError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Download not found: {0}")]
    NotFound(Uuid),

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("Resume not supported for this download")]
    ResumeNotSupported,

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Download was cancelled")]
    Cancelled,

    #[error("Download was paused")]
    Paused,

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Download already exists: {0}")]
    AlreadyExists(Uuid),

    #[error("Server error: {status} - {message}")]
    ServerError { status: u16, message: String },

    #[error("Timeout")]
    Timeout,

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl DlmanError {
    /// Check if this error is retryable
    pub fn is_retryable(&self) -> bool {
        match self {
            DlmanError::Network(_) | DlmanError::Timeout => true,
            DlmanError::ServerError { status, .. } => *status >= 500,
            _ => false,
        }
    }
}

// Allow converting to String for Tauri commands
impl From<DlmanError> for String {
    fn from(error: DlmanError) -> Self {
        error.to_string()
    }
}
