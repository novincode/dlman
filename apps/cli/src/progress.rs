//! Progress bar utilities for CLI downloads

use console::style;
use dlman_types::{CoreEvent, Download};
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Manages progress bars for multiple downloads
pub struct DownloadProgress {
    multi: MultiProgress,
    bars: Arc<RwLock<HashMap<Uuid, ProgressBar>>>,
}

impl DownloadProgress {
    pub fn new() -> Self {
        Self {
            multi: MultiProgress::new(),
            bars: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a progress bar for a download
    pub async fn add_download(&self, download: &Download) -> ProgressBar {
        let total = download.size.unwrap_or(0);
        let pb = self.multi.add(ProgressBar::new(total));

        pb.set_style(
            ProgressStyle::default_bar()
                .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {bytes}/{total_bytes} ({bytes_per_sec}, {eta})")
                .unwrap()
                .progress_chars("█▓▒░  "),
        );

        pb.set_message(download.filename.clone());
        pb.set_position(download.downloaded);

        self.bars.write().await.insert(download.id, pb.clone());
        pb
    }

    /// Update a progress bar from an event
    pub async fn handle_event(&self, event: &CoreEvent) {
        match event {
            CoreEvent::DownloadProgress {
                id,
                downloaded,
                total,
                speed,
                eta,
            } => {
                let bars = self.bars.read().await;
                if let Some(pb) = bars.get(id) {
                    if let Some(total) = total {
                        pb.set_length(*total);
                    }
                    pb.set_position(*downloaded);
                }
            }

            CoreEvent::DownloadStatusChanged { id, status, error } => {
                let bars = self.bars.read().await;
                if let Some(pb) = bars.get(id) {
                    use dlman_types::DownloadStatus;

                    match status {
                        DownloadStatus::Completed => {
                            pb.finish_with_message(format!(
                                "{} Download complete",
                                style("✓").green().bold()
                            ));
                        }
                        DownloadStatus::Failed => {
                            pb.abandon_with_message(format!(
                                "{} Failed: {}",
                                style("✗").red().bold(),
                                error.as_deref().unwrap_or("Unknown error")
                            ));
                        }
                        DownloadStatus::Paused => {
                            pb.set_message(format!("{} Paused", style("⏸").yellow()));
                        }
                        DownloadStatus::Cancelled => {
                            pb.abandon_with_message(format!(
                                "{} Cancelled",
                                style("○").dim()
                            ));
                        }
                        _ => {}
                    }
                }
            }

            _ => {}
        }
    }

    /// Remove a progress bar
    pub async fn remove(&self, id: Uuid) {
        if let Some(pb) = self.bars.write().await.remove(&id) {
            pb.finish_and_clear();
        }
    }

    /// Clear all progress bars
    pub async fn clear(&self) {
        for pb in self.bars.write().await.drain() {
            pb.1.finish_and_clear();
        }
    }
}

impl Default for DownloadProgress {
    fn default() -> Self {
        Self::new()
    }
}
