//! Output formatting utilities

use crate::OutputFormat;
use serde::Serialize;

/// Print output in the specified format
pub fn print_output<T: Serialize + std::fmt::Display>(
    value: &T,
    format: OutputFormat,
) -> anyhow::Result<()> {
    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(value)?);
        }
        OutputFormat::Human | OutputFormat::Table => {
            println!("{}", value);
        }
    }
    Ok(())
}

/// Format bytes as human-readable
pub fn format_bytes(bytes: u64) -> String {
    human_bytes::human_bytes(bytes as f64)
}

/// Format speed as human-readable
pub fn format_speed(bytes_per_sec: u64) -> String {
    format!("{}/s", human_bytes::human_bytes(bytes_per_sec as f64))
}

/// Format duration as human-readable
pub fn format_eta(seconds: u64) -> String {
    if seconds == 0 {
        return "—".to_string();
    }

    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;

    if hours > 0 {
        format!("{}h {}m {}s", hours, minutes, secs)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, secs)
    } else {
        format!("{}s", secs)
    }
}
