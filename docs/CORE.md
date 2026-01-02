# DLMan Core - Download Engine (v1.3.0)

## Overview

The `dlman-core` crate is the heart of DLMan. It handles all download operations and is shared between the desktop app and CLI.

## Features

### Multi-Segment Downloads
- Splits large files into segments for parallel downloading
- **Configurable segment count** via app settings (default: 4)
- Each segment downloads independently with its own HTTP connection
- Automatic fallback for servers without range support

### Pause/Resume
- **SQLite-based persistence** - all progress saved atomically
- Resumes from exact byte position per segment
- Handles partial segment completion
- Crash-safe: can resume after unexpected shutdown

### Queue Management
- Priority-based scheduling
- Time-based scheduling (start/stop times)
- Concurrent download limits per queue
- Per-queue speed limits
- Post-completion actions (shutdown, sleep, etc.)

### Speed Control
- Per-download speed limits (override queue limit)
- Per-queue speed limits
- Token bucket rate limiting (smooth throttling)
- Real-time speed limit updates for active downloads

## API

### Core Struct
```rust
pub struct DlmanCore {
    pub downloads: Arc<RwLock<HashMap<Uuid, Download>>>,
    pub queues: Arc<RwLock<HashMap<Uuid, Queue>>>,
    pub settings: Arc<RwLock<Settings>>,
    pub db: Database,
}

impl DlmanCore {
    pub async fn new(data_dir: PathBuf) -> Result<Self>;
    
    // Downloads
    pub async fn add_download(&self, url: &str, dest: &Path, queue_id: Uuid) -> Result<Download>;
    pub async fn pause_download(&self, id: Uuid) -> Result<()>;
    pub async fn resume_download(&self, id: Uuid) -> Result<()>;
    pub async fn cancel_download(&self, id: Uuid) -> Result<()>;
    pub async fn delete_download(&self, id: Uuid, delete_file: bool) -> Result<()>;
    
    // Queues
    pub async fn create_queue(&self, name: &str, options: QueueOptions) -> Result<Queue>;
    pub async fn update_queue(&self, id: Uuid, options: QueueOptions) -> Result<Queue>;
    pub async fn delete_queue(&self, id: Uuid) -> Result<()>;
    pub async fn start_queue(&self, id: Uuid) -> Result<()>;
    pub async fn stop_queue(&self, id: Uuid) -> Result<()>;
    
    // Bulk
    pub async fn probe_links(&self, urls: Vec<String>) -> Vec<LinkInfo>;
    pub async fn move_downloads(&self, ids: Vec<Uuid>, queue_id: Uuid) -> Result<()>;
}
```

### Event System
```rust
pub enum CoreEvent {
    DownloadProgress {
        id: Uuid,
        downloaded: u64,
        total: Option<u64>,
        speed: u64,
        eta: Option<Duration>,
    },
    DownloadStatusChanged {
        id: Uuid,
        status: DownloadStatus,
        error: Option<String>,
    },
    QueueStarted { id: Uuid },
    QueueCompleted { id: Uuid },
}

// Subscribe to events
pub fn subscribe(&self) -> broadcast::Receiver<CoreEvent>;
```

## Download Process

### 1. Add Download
```
User provides URL
    ↓
HEAD request to get file info
    ↓
Check Accept-Ranges header
    ↓
Create Download record in DB
    ↓
Add to queue (or start immediately)
```

### 2. Start Download
```
Check if resume is possible
    ↓
Create/open destination file
    ↓
Calculate segments based on file size
    ↓
Spawn segment download tasks
    ↓
Merge segments on completion
    ↓
Verify file (optional checksum)
```

### 3. Segment Download
```
For each segment:
    ↓
Send GET request with Range header
    ↓
Stream response to temp file
    ↓
Update progress every 100ms
    ↓
Handle errors with retry
    ↓
Mark segment complete
```

### 4. Resume Download
```
Load download from SQLite
    ↓
Check existing segments in database
    ↓
Resume incomplete segments from last byte
    ↓
Continue downloading
```

## Database Schema (SQLite)

### Downloads Table
```sql
CREATE TABLE downloads (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    final_url TEXT,
    filename TEXT NOT NULL,
    destination TEXT NOT NULL,
    size INTEGER,
    downloaded INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    queue_id TEXT NOT NULL,
    category_id TEXT,
    color TEXT,
    error TEXT,
    speed_limit INTEGER,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0
);
```

### Segments Table
```sql
CREATE TABLE segments (
    download_id TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    start_byte INTEGER NOT NULL,
    end_byte INTEGER NOT NULL,
    downloaded_bytes INTEGER NOT NULL DEFAULT 0,
    complete INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (download_id, segment_index),
    FOREIGN KEY (download_id) REFERENCES downloads(id) ON DELETE CASCADE
);
```

### Settings Table
```sql
CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    default_download_path TEXT NOT NULL,
    max_concurrent_downloads INTEGER NOT NULL DEFAULT 4,
    default_segments INTEGER NOT NULL DEFAULT 4,
    global_speed_limit INTEGER,
    theme TEXT NOT NULL DEFAULT 'system',
    dev_mode INTEGER NOT NULL DEFAULT 0,
    minimize_to_tray INTEGER NOT NULL DEFAULT 1,
    start_on_boot INTEGER NOT NULL DEFAULT 0,
    browser_integration_port INTEGER NOT NULL DEFAULT 7899,
    remember_last_path INTEGER NOT NULL DEFAULT 1,
    max_retries INTEGER NOT NULL DEFAULT 5,
    retry_delay_seconds INTEGER NOT NULL DEFAULT 30
);
```

## Configuration

### Segment Sizing
| File Size | Segments | Segment Size |
|-----------|----------|--------------|
| < 1MB | 1 | Full file |
| 1MB - 10MB | 2 | 50% each |
| 10MB - 100MB | 4 | 25% each |
| 100MB - 1GB | 8 | 12.5% each |
| > 1GB | 16 | Variable |

### Retry Policy
- Max retries: 5
- Initial delay: 1s
- Backoff: Exponential (1s, 2s, 4s, 8s, 16s)
- Jitter: ±10%

## Error Handling

All operations return `Result<T, DlmanError>`:

```rust
pub enum DlmanError {
    Network(reqwest::Error),
    Io(std::io::Error),
    NotFound(Uuid),
    InvalidUrl(String),
    ResumeNotSupported,
    Database(sqlx::Error),
    Cancelled,
}
```

Errors are:
- Logged with context
- Saved to download record
- Surfaced to UI
- Retryable when possible
