//! Application state management

use dlman_core::DlmanCore;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Application state managed by Tauri
pub struct AppState {
    pub core: Arc<RwLock<Option<DlmanCore>>>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub async fn new(data_dir: PathBuf) -> Result<Self, dlman_core::DlmanError> {
        let core = DlmanCore::new(data_dir.clone()).await?;

        Ok(Self {
            core: Arc::new(RwLock::new(Some(core))),
            data_dir,
        })
    }

    pub async fn with_core<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&DlmanCore) -> R,
    {
        let guard = self.core.read().await;
        guard
            .as_ref()
            .map(f)
            .ok_or_else(|| "Core not initialized".to_string())
    }

    pub async fn with_core_async<F, Fut, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(DlmanCore) -> Fut,
        Fut: std::future::Future<Output = Result<R, dlman_core::DlmanError>>,
    {
        let guard = self.core.read().await;
        match guard.as_ref() {
            Some(core) => f(core.clone()).await.map_err(|e| e.to_string()),
            None => Err("Core not initialized".to_string()),
        }
    }
}
