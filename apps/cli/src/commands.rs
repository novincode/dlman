//! CLI command implementations

use crate::{ConfigAction, OutputFormat, QueueAction};
use anyhow::{anyhow, Result};
use console::style;
use dlman_core::DlmanCore;
use dlman_types::{Download, DownloadStatus, Queue, QueueOptions};
use std::path::PathBuf;
use uuid::Uuid;

// ============================================================================
// Download Commands
// ============================================================================

pub async fn add_download(
    core: &DlmanCore,
    url: &str,
    output: Option<PathBuf>,
    queue: Option<String>,
    format: OutputFormat,
) -> Result<()> {
    let destination = output.unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });

    let queue_id = match queue {
        Some(id) => Uuid::parse_str(&id)?,
        None => Uuid::nil(), // Default queue
    };

    let download = core.add_download(url, destination, queue_id, None, None).await?;

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&download)?);
        }
        OutputFormat::Human | OutputFormat::Table => {
            println!(
                "{} Added download: {}",
                style("✓").green().bold(),
                style(&download.filename).cyan()
            );
            println!("  ID: {}", download.id);
            if let Some(size) = download.size {
                println!("  Size: {}", human_bytes::human_bytes(size as f64));
            }
        }
    }

    Ok(())
}

pub async fn list_downloads(
    core: &DlmanCore,
    status_filter: Option<String>,
    queue_filter: Option<String>,
    show_all: bool,
    format: OutputFormat,
) -> Result<()> {
    let downloads = core.get_all_downloads().await?;

    // Apply filters
    let filtered: Vec<_> = downloads
        .into_iter()
        .filter(|d| {
            if let Some(ref status) = status_filter {
                let s = format!("{:?}", d.status).to_lowercase();
                if !s.contains(&status.to_lowercase()) {
                    return false;
                }
            }
            if let Some(ref queue) = queue_filter {
                if let Ok(qid) = Uuid::parse_str(queue) {
                    if d.queue_id != qid {
                        return false;
                    }
                }
            }
            true
        })
        .collect();

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&filtered)?);
        }
        OutputFormat::Table => {
            use tabled::{Table, Tabled};

            #[derive(Tabled)]
            struct DownloadRow {
                id: String,
                filename: String,
                size: String,
                progress: String,
                status: String,
            }

            let rows: Vec<DownloadRow> = filtered
                .iter()
                .map(|d| DownloadRow {
                    id: d.id.to_string()[..8].to_string(),
                    filename: if d.filename.len() > 30 {
                        format!("{}...", &d.filename[..27])
                    } else {
                        d.filename.clone()
                    },
                    size: d
                        .size
                        .map(|s| human_bytes::human_bytes(s as f64))
                        .unwrap_or_else(|| "?".to_string()),
                    progress: format!("{:.1}%", d.progress()),
                    status: format!("{:?}", d.status),
                })
                .collect();

            println!("{}", Table::new(rows));
        }
        OutputFormat::Human => {
            if filtered.is_empty() {
                println!("{}", style("No downloads found").dim());
                return Ok(());
            }

            for download in &filtered {
                print_download_summary(download, show_all);
            }
            println!();
            println!(
                "{} download(s) total",
                style(filtered.len()).bold()
            );
        }
    }

    Ok(())
}

fn print_download_summary(download: &Download, detailed: bool) {
    let status_icon = match download.status {
        DownloadStatus::Completed => style("✓").green(),
        DownloadStatus::Downloading => style("↓").cyan(),
        DownloadStatus::Paused => style("⏸").yellow(),
        DownloadStatus::Failed => style("✗").red(),
        DownloadStatus::Cancelled => style("○").dim(),
        _ => style("·").dim(),
    };

    let progress = format!("{:.1}%", download.progress());

    println!(
        "{} {} {} [{}]",
        status_icon,
        style(&download.filename).bold(),
        style(&progress).dim(),
        style(format!("{:?}", download.status)).dim()
    );

    if detailed {
        println!("    ID: {}", download.id);
        println!("    URL: {}", download.url);
        if let Some(size) = download.size {
            println!(
                "    Size: {} / {}",
                human_bytes::human_bytes(download.downloaded as f64),
                human_bytes::human_bytes(size as f64)
            );
        }
        if let Some(ref error) = download.error {
            println!("    Error: {}", style(error).red());
        }
        println!();
    }
}

pub async fn show_info(core: &DlmanCore, id: &str, format: OutputFormat) -> Result<()> {
    let uuid = Uuid::parse_str(id)?;
    let download = core.get_download(uuid).await?;

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&download)?);
        }
        _ => {
            print_download_summary(&download, true);
        }
    }

    Ok(())
}

pub async fn pause_download(core: &DlmanCore, id: &str, _format: OutputFormat) -> Result<()> {
    let uuid = Uuid::parse_str(id)?;
    core.pause_download(uuid).await?;
    println!("{} Download paused", style("✓").green().bold());
    Ok(())
}

pub async fn resume_download(core: &DlmanCore, id: &str, _format: OutputFormat) -> Result<()> {
    let uuid = Uuid::parse_str(id)?;
    core.resume_download(uuid).await?;
    println!("{} Download resumed", style("✓").green().bold());
    Ok(())
}

pub async fn cancel_download(core: &DlmanCore, id: &str, _format: OutputFormat) -> Result<()> {
    let uuid = Uuid::parse_str(id)?;
    core.cancel_download(uuid).await?;
    println!("{} Download cancelled", style("✓").green().bold());
    Ok(())
}

pub async fn delete_download(
    core: &DlmanCore,
    id: &str,
    with_file: bool,
    _format: OutputFormat,
) -> Result<()> {
    let uuid = Uuid::parse_str(id)?;
    core.delete_download(uuid, with_file).await?;
    println!("{} Download deleted", style("✓").green().bold());
    Ok(())
}

// ============================================================================
// Queue Commands
// ============================================================================

pub async fn queue_action(
    core: &DlmanCore,
    action: QueueAction,
    format: OutputFormat,
) -> Result<()> {
    match action {
        QueueAction::List => {
            let queues = core.get_queues().await;

            match format {
                OutputFormat::Json => {
                    println!("{}", serde_json::to_string_pretty(&queues)?);
                }
                OutputFormat::Table => {
                    use tabled::{Table, Tabled};

                    #[derive(Tabled)]
                    struct QueueRow {
                        id: String,
                        name: String,
                        color: String,
                        max_concurrent: u32,
                    }

                    let rows: Vec<QueueRow> = queues
                        .iter()
                        .map(|q| QueueRow {
                            id: q.id.to_string()[..8].to_string(),
                            name: q.name.clone(),
                            color: q.color.clone(),
                            max_concurrent: q.max_concurrent,
                        })
                        .collect();

                    println!("{}", Table::new(rows));
                }
                OutputFormat::Human => {
                    for queue in &queues {
                        println!(
                            "{} {} ({})",
                            style("•").color256(
                                u8::from_str_radix(&queue.color[1..3], 16).unwrap_or(255)
                            ),
                            style(&queue.name).bold(),
                            queue.id
                        );
                    }
                }
            }
        }

        QueueAction::Create {
            name,
            color,
            max_concurrent,
            speed_limit,
        } => {
            let options = QueueOptions {
                color,
                max_concurrent,
                speed_limit,
                ..Default::default()
            };

            let queue = core.create_queue(&name, options).await?;
            println!(
                "{} Created queue: {} ({})",
                style("✓").green().bold(),
                style(&queue.name).cyan(),
                queue.id
            );
        }

        QueueAction::Delete { id } => {
            let uuid = Uuid::parse_str(&id)?;
            core.delete_queue(uuid).await?;
            println!("{} Queue deleted", style("✓").green().bold());
        }

        QueueAction::Start { id } => {
            let uuid = Uuid::parse_str(&id)?;
            core.start_queue(uuid).await?;
            println!("{} Queue started", style("✓").green().bold());
        }

        QueueAction::Stop { id } => {
            let uuid = Uuid::parse_str(&id)?;
            core.stop_queue(uuid).await?;
            println!("{} Queue stopped", style("✓").green().bold());
        }
    }

    Ok(())
}

// ============================================================================
// Probe Commands
// ============================================================================

pub async fn probe_urls(core: &DlmanCore, urls: Vec<String>, format: OutputFormat) -> Result<()> {
    let results = core.probe_links(urls).await;

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&results)?);
        }
        OutputFormat::Table => {
            use tabled::{Table, Tabled};

            #[derive(Tabled)]
            struct LinkRow {
                filename: String,
                size: String,
                resumable: String,
            }

            let rows: Vec<LinkRow> = results
                .iter()
                .map(|info| LinkRow {
                    filename: if info.filename.len() > 40 {
                        format!("{}...", &info.filename[..37])
                    } else {
                        info.filename.clone()
                    },
                    size: info
                        .size
                        .map(|s| human_bytes::human_bytes(s as f64))
                        .unwrap_or_else(|| "?".to_string()),
                    resumable: if info.resumable { "Yes" } else { "No" }.to_string(),
                })
                .collect();

            println!("{}", Table::new(rows));
        }
        OutputFormat::Human => {
            for info in &results {
                if let Some(ref error) = info.error {
                    println!(
                        "{} {}: {}",
                        style("✗").red(),
                        info.url,
                        style(error).red()
                    );
                } else {
                    println!("{} {}", style("✓").green(), info.filename);
                    if let Some(size) = info.size {
                        println!("    Size: {}", human_bytes::human_bytes(size as f64));
                    }
                    if let Some(ref ct) = info.content_type {
                        println!("    Type: {}", ct);
                    }
                    println!(
                        "    Resumable: {}",
                        if info.resumable {
                            style("Yes").green()
                        } else {
                            style("No").yellow()
                        }
                    );
                }
            }
        }
    }

    Ok(())
}

// ============================================================================
// Data Commands
// ============================================================================

pub async fn import_data(
    core: &DlmanCore,
    file: PathBuf,
    _format: OutputFormat,
) -> Result<()> {
    let content = tokio::fs::read_to_string(&file).await?;
    core.import_data(&content).await?;
    println!(
        "{} Data imported from {}",
        style("✓").green().bold(),
        file.display()
    );
    Ok(())
}

pub async fn export_data(
    core: &DlmanCore,
    output: Option<PathBuf>,
    _format: OutputFormat,
) -> Result<()> {
    let data = core.export_data().await?;

    match output {
        Some(path) => {
            tokio::fs::write(&path, &data).await?;
            println!(
                "{} Data exported to {}",
                style("✓").green().bold(),
                path.display()
            );
        }
        None => {
            println!("{}", data);
        }
    }

    Ok(())
}

// ============================================================================
// Config Commands
// ============================================================================

pub async fn config_action(
    core: &DlmanCore,
    action: Option<ConfigAction>,
    format: OutputFormat,
) -> Result<()> {
    match action {
        None | Some(ConfigAction::Show) => {
            let settings = core.get_settings().await;

            match format {
                OutputFormat::Json => {
                    println!("{}", serde_json::to_string_pretty(&settings)?);
                }
                _ => {
                    println!("DLMan Configuration:");
                    println!();
                    println!(
                        "  Default download path: {}",
                        settings.default_download_path.display()
                    );
                    println!(
                        "  Max concurrent downloads: {}",
                        settings.max_concurrent_downloads
                    );
                    println!("  Default segments: {}", settings.default_segments);
                    println!(
                        "  Global speed limit: {}",
                        settings
                            .global_speed_limit
                            .map(|s| human_bytes::human_bytes(s as f64) + "/s")
                            .unwrap_or_else(|| "Unlimited".to_string())
                    );
                    println!("  Theme: {:?}", settings.theme);
                    println!("  Dev mode: {}", settings.dev_mode);
                }
            }
        }

        Some(ConfigAction::Get { key }) => {
            let settings = core.get_settings().await;
            let value = match key.as_str() {
                "default_download_path" => settings.default_download_path.display().to_string(),
                "max_concurrent_downloads" => settings.max_concurrent_downloads.to_string(),
                "default_segments" => settings.default_segments.to_string(),
                "theme" => format!("{:?}", settings.theme),
                "dev_mode" => settings.dev_mode.to_string(),
                _ => return Err(anyhow!("Unknown config key: {}", key)),
            };
            println!("{}", value);
        }

        Some(ConfigAction::Set { key, value }) => {
            let mut settings = core.get_settings().await;

            match key.as_str() {
                "default_download_path" => settings.default_download_path = PathBuf::from(value),
                "max_concurrent_downloads" => settings.max_concurrent_downloads = value.parse()?,
                "default_segments" => settings.default_segments = value.parse()?,
                "dev_mode" => settings.dev_mode = value.parse()?,
                _ => return Err(anyhow!("Unknown or read-only config key: {}", key)),
            }

            core.update_settings(settings).await?;
            println!("{} Config updated", style("✓").green().bold());
        }

        Some(ConfigAction::Reset) => {
            use dialoguer::Confirm;

            let confirmed = Confirm::new()
                .with_prompt("Reset all settings to defaults?")
                .default(false)
                .interact()?;

            if confirmed {
                core.update_settings(dlman_types::Settings::default())
                    .await?;
                println!("{} Settings reset to defaults", style("✓").green().bold());
            }
        }
    }

    Ok(())
}
