//! Shared types for DLMan
//!
//! This crate contains all the shared data structures used across
//! the desktop app, CLI, and core library.

use chrono::{DateTime, NaiveTime, Utc, Weekday};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

// ============================================================================
// Download Types
// ============================================================================

/// Represents a single download task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    pub id: Uuid,
    pub url: String,
    pub final_url: Option<String>,
    pub filename: String,
    pub destination: PathBuf,
    pub size: Option<u64>,
    pub downloaded: u64,
    pub status: DownloadStatus,
    pub segments: Vec<Segment>,
    pub queue_id: Uuid,
    pub category_id: Option<Uuid>,
    pub color: Option<String>,
    pub error: Option<String>,
    pub speed_limit: Option<u64>,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    /// Number of retry attempts made for this download
    #[serde(default)]
    pub retry_count: u32,
}

impl Download {
    pub fn new(url: String, destination: PathBuf, queue_id: Uuid) -> Self {
        let filename = url
            .rsplit('/')
            .next()
            .unwrap_or("download")
            .to_string();

        Self {
            id: Uuid::new_v4(),
            url,
            final_url: None,
            filename,
            destination,
            size: None,
            downloaded: 0,
            status: DownloadStatus::Pending,
            segments: Vec::new(),
            queue_id,
            category_id: None,
            color: None,
            error: None,
            speed_limit: None,
            created_at: Utc::now(),
            completed_at: None,
            retry_count: 0,
        }
    }

    pub fn progress(&self) -> f64 {
        match self.size {
            Some(size) if size > 0 => (self.downloaded as f64 / size as f64) * 100.0,
            _ => 0.0,
        }
    }
}

/// Status of a download
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Paused,
    Completed,
    Failed,
    Queued,
    Cancelled,
    Deleted,
}

/// A segment of a multi-part download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub index: u32,
    pub start: u64,
    pub end: u64,
    pub downloaded: u64,
    pub complete: bool,
}

impl Segment {
    pub fn new(index: u32, start: u64, end: u64) -> Self {
        Self {
            index,
            start,
            end,
            downloaded: 0,
            complete: false,
        }
    }

    /// Get the total size of this segment in bytes
    /// Returns u64::MAX for unknown size segments (where end = u64::MAX)
    pub fn size(&self) -> u64 {
        if self.end == u64::MAX {
            u64::MAX
        } else {
            self.end - self.start + 1
        }
    }

    /// Check if this is an unknown size segment
    pub fn is_unknown_size(&self) -> bool {
        self.end == u64::MAX
    }

    pub fn progress(&self) -> f64 {
        if self.end == u64::MAX {
            0.0 // Cannot calculate progress for unknown size
        } else {
            (self.downloaded as f64 / self.size() as f64) * 100.0
        }
    }
}

// ============================================================================
// Queue Types
// ============================================================================

/// A download queue with scheduling and limits
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Queue {
    pub id: Uuid,
    pub name: String,
    pub color: String,
    pub icon: Option<String>,
    pub max_concurrent: u32,
    pub speed_limit: Option<u64>,
    /// Number of segments for downloads in this queue (None = use app settings)
    #[serde(default)]
    pub segment_count: Option<u32>,
    pub schedule: Option<Schedule>,
    pub post_action: PostAction,
    pub created_at: DateTime<Utc>,
}

impl Queue {
    pub fn new(name: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            color: "#3b82f6".to_string(), // Default blue
            icon: None,
            max_concurrent: 2,
            speed_limit: None,
            segment_count: None,
            schedule: None,
            post_action: PostAction::None,
            created_at: Utc::now(),
        }
    }

    /// The default queue that always exists
    pub fn default_queue() -> Self {
        Self {
            id: Uuid::nil(),
            name: "Default".to_string(),
            color: "#3b82f6".to_string(),
            icon: None,
            max_concurrent: 4,
            speed_limit: None,
            segment_count: None,
            schedule: None,
            post_action: PostAction::None,
            created_at: Utc::now(),
        }
    }
}

/// Schedule for automatic queue start/stop
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub enabled: bool,
    pub start_time: Option<NaiveTime>,
    pub stop_time: Option<NaiveTime>,
    #[serde(with = "weekday_vec_serde")]
    pub days: Vec<Weekday>,
}

/// Custom serialization for Vec<Weekday> to/from lowercase string array
mod weekday_vec_serde {
    use chrono::Weekday;
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(days: &[Weekday], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeSeq;
        let mut seq = serializer.serialize_seq(Some(days.len()))?;
        for day in days {
            let day_str = match day {
                Weekday::Mon => "mon",
                Weekday::Tue => "tue",
                Weekday::Wed => "wed",
                Weekday::Thu => "thu",
                Weekday::Fri => "fri",
                Weekday::Sat => "sat",
                Weekday::Sun => "sun",
            };
            seq.serialize_element(day_str)?;
        }
        seq.end()
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<Weekday>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let strings: Vec<String> = Vec::deserialize(deserializer)?;
        let mut days = Vec::with_capacity(strings.len());
        for s in strings {
            let day = match s.to_lowercase().as_str() {
                "mon" | "monday" => Weekday::Mon,
                "tue" | "tuesday" => Weekday::Tue,
                "wed" | "wednesday" => Weekday::Wed,
                "thu" | "thursday" => Weekday::Thu,
                "fri" | "friday" => Weekday::Fri,
                "sat" | "saturday" => Weekday::Sat,
                "sun" | "sunday" => Weekday::Sun,
                other => {
                    return Err(serde::de::Error::custom(format!(
                        "Invalid weekday: {}",
                        other
                    )))
                }
            };
            days.push(day);
        }
        Ok(days)
    }
}

/// Action to perform after queue completes
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PostAction {
    #[default]
    None,
    Shutdown,
    Sleep,
    Hibernate,
    Notify,
    RunCommand(String),
}

/// Options for creating/updating a queue
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct QueueOptions {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub max_concurrent: Option<u32>,
    pub speed_limit: Option<u64>,
    pub segment_count: Option<u32>,
    pub schedule: Option<Schedule>,
    pub post_action: Option<PostAction>,
}

// ============================================================================
// Settings Types
// ============================================================================

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub default_download_path: PathBuf,
    pub max_concurrent_downloads: u32,
    pub default_segments: u32,
    pub global_speed_limit: Option<u64>,
    pub theme: Theme,
    pub dev_mode: bool,
    pub minimize_to_tray: bool,
    pub start_on_boot: bool,
    pub browser_integration_port: u16,
    pub remember_last_path: bool,
    /// Maximum number of automatic retries for failed downloads
    pub max_retries: u32,
    /// Delay in seconds between retry attempts
    pub retry_delay_seconds: u32,
    /// Proxy configuration
    #[serde(default)]
    pub proxy: ProxySettings,
}

/// Proxy configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProxySettings {
    /// Proxy mode: "none", "system", or "manual"
    #[serde(default = "default_proxy_mode")]
    pub mode: String,
    /// HTTP proxy URL (for manual mode)
    pub http_proxy: Option<String>,
    /// HTTPS proxy URL (for manual mode)
    pub https_proxy: Option<String>,
    /// Bypass proxy for these hosts (comma-separated)
    pub no_proxy: Option<String>,
    /// Proxy authentication username
    pub username: Option<String>,
    /// Proxy authentication password
    pub password: Option<String>,
}

fn default_proxy_mode() -> String {
    "system".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_download_path: dirs::download_dir()
                .map(|p| p.join("DLMan"))
                .unwrap_or_else(|| PathBuf::from(".")),
            max_concurrent_downloads: 4,
            default_segments: 4,
            global_speed_limit: None,
            theme: Theme::System,
            dev_mode: false,
            minimize_to_tray: true,
            start_on_boot: false,
            browser_integration_port: 7899,
            remember_last_path: true,
            max_retries: 5,
            retry_delay_seconds: 30,
            proxy: ProxySettings::default(),
        }
    }
}

/// Theme setting
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

// ============================================================================
// Event Types
// ============================================================================

/// Events emitted by the core to the UI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum CoreEvent {
    DownloadProgress {
        id: Uuid,
        downloaded: u64,
        total: Option<u64>,
        speed: u64,
        eta: Option<u64>, // seconds
    },
    SegmentProgress {
        download_id: Uuid,
        segment_index: u32,
        downloaded: u64,
    },
    DownloadStatusChanged {
        id: Uuid,
        status: DownloadStatus,
        error: Option<String>,
    },
    DownloadAdded {
        download: Download,
    },
    DownloadUpdated {
        download: Download,
    },
    DownloadRemoved {
        id: Uuid,
    },
    QueueStarted {
        id: Uuid,
    },
    QueueCompleted {
        id: Uuid,
    },
    CredentialRequired {
        download_id: Uuid,
        domain: String,
        url: String,
        status_code: u16,
    },
    Error {
        message: String,
        context: Option<String>,
    },
}

// ============================================================================
// API Types
// ============================================================================

/// Information about a link (from probing)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkInfo {
    pub url: String,
    pub final_url: Option<String>,
    pub filename: String,
    pub size: Option<u64>,
    pub content_type: Option<String>,
    pub resumable: bool,
    pub error: Option<String>,
}

// ============================================================================
// Site Credentials Types
// ============================================================================

/// Saved login credentials for a domain/site
/// Used to automatically authenticate when downloading from subscription-based sites
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteCredential {
    pub id: Uuid,
    /// The domain pattern (e.g., "example.com", "*.example.com")
    pub domain: String,
    /// Protocol: "http", "https", "ftp", or "any"
    #[serde(default = "default_protocol")]
    pub protocol: String,
    /// Username for authentication
    pub username: String,
    /// Password for authentication
    pub password: String,
    /// Whether this credential is enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// When this credential was created
    pub created_at: DateTime<Utc>,
    /// When this credential was last used
    pub last_used_at: Option<DateTime<Utc>>,
    /// Optional notes/description
    #[serde(default)]
    pub notes: Option<String>,
}

fn default_protocol() -> String {
    "any".to_string()
}

fn default_enabled() -> bool {
    true
}

impl SiteCredential {
    pub fn new(domain: String, username: String, password: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            domain,
            protocol: "any".to_string(),
            username,
            password,
            enabled: true,
            created_at: Utc::now(),
            last_used_at: None,
            notes: None,
        }
    }
    
    /// Check if this credential matches a given URL
    pub fn matches_url(&self, url: &str) -> bool {
        if !self.enabled {
            return false;
        }
        
        // Parse the URL to extract domain and protocol
        let parsed = match url::Url::parse(url) {
            Ok(u) => u,
            Err(_) => return false,
        };
        
        let url_host = match parsed.host_str() {
            Some(h) => h.to_lowercase(),
            None => return false,
        };
        
        let url_scheme = parsed.scheme().to_lowercase();
        
        // Check protocol match
        if self.protocol != "any" {
            if self.protocol.to_lowercase() != url_scheme {
                return false;
            }
        }
        
        // Check domain match
        let domain = self.domain.to_lowercase();
        
        // Wildcard domain matching (e.g., "*.example.com")
        if domain.starts_with("*.") {
            let suffix = &domain[2..]; // Remove "*."
            return url_host == suffix || url_host.ends_with(&format!(".{}", suffix));
        }
        
        // Exact domain match (also match subdomains)
        url_host == domain || url_host.ends_with(&format!(".{}", domain))
    }
}

/// Event emitted when credentials are needed for a download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialRequest {
    /// The download ID that needs credentials
    pub download_id: Uuid,
    /// The domain that needs authentication
    pub domain: String,
    /// The full URL being downloaded
    pub url: String,
    /// HTTP status code that triggered the request (401, 403)
    pub status_code: u16,
}

/// Result of a batch import
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub successful: Vec<Download>,
    pub failed: Vec<ImportError>,
}

/// Error during import
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportError {
    pub url: String,
    pub error: String,
}
