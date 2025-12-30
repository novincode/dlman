# DLMan Core - Download Engine

## Overview

The `dlman-core` crate is the heart of DLMan. It handles all download operations and is shared between the desktop app and CLI.

## Features

### Multi-Segment Downloads
- Splits large files into segments for parallel downloading
- Adaptive segment sizing based on file size
- Automatic fallback for servers without range support

### Pause/Resume
- Saves progress to `.dlman.meta` files
- Resumes from exact byte position
- Handles partial segment completion

### Queue Management
- Priority-based scheduling
- Time-based scheduling (start/stop times)
- Concurrent download limits per queue
- Post-completion actions (shutdown, sleep, etc.)

### Speed Control
- Per-download speed limits
- Global speed limit
- Adaptive throttling using token bucket

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
Read .dlman.meta file
    ↓
Check completed segments
    ↓
Resume incomplete segments
    ↓
Continue from last byte position
```

## File Formats

### Meta File (.dlman.meta)
```json
{
  "id": "uuid",
  "url": "original-url",
  "final_url": "after-redirects",
  "filename": "file.zip",
  "size": 1048576,
  "segments": [
    { "start": 0, "end": 262143, "downloaded": 262144, "complete": true },
    { "start": 262144, "end": 524287, "downloaded": 100000, "complete": false }
  ],
  "created_at": "2025-01-01T00:00:00Z"
}
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
