# DLMan Core - Download Engine (v1.5.0)

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
- Time-based scheduling (start/stop times, weekdays)
- Concurrent download limits per queue
- Per-queue speed limits
- Post-completion actions (shutdown, sleep, hibernate, run command)

### Queue Scheduler (v1.5.0+)
- Background scheduler checks every 30 seconds
- Automatically starts queues at scheduled time
- Stops queues at scheduled stop time
- Respects day-of-week settings
- Calculates countdown to next scheduled start

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

## Multi-Segment Download Engine

### How It Works

When you download a file, DLMan can split it into multiple segments that download in parallel. This can significantly speed up downloads, especially for large files.

```
                    URL: https://example.com/large-file.zip (1 GB)
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │           DownloadManager              │
                    │  - Probes URL for file info            │
                    │  - Checks Accept-Ranges header         │
                    │  - Creates segment plan                │
                    └───────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
             ┌──────────┐        ┌──────────┐        ┌──────────┐
             │ Segment 1│        │ Segment 2│        │ Segment N│
             │ 0-256MB  │        │256-512MB │        │  ...     │
             └──────────┘        └──────────┘        └──────────┘
                    │                   │                   │
                    │     HTTP GET with Range header        │
                    ▼                   ▼                   ▼
             ┌──────────┐        ┌──────────┐        ┌──────────┐
             │  Worker  │        │  Worker  │        │  Worker  │
             │  Task    │        │  Task    │        │  Task    │
             └──────────┘        └──────────┘        └──────────┘
                    │                   │                   │
                    └───────────────────┼───────────────────┘
                                        ▼
                    ┌───────────────────────────────────────┐
                    │         Destination File               │
                    │  (Segments write to their positions)   │
                    └───────────────────────────────────────┘
```

### Segment Worker

Each segment is handled by an async task (`SegmentWorker`) that:

1. **Sends HTTP request** with `Range: bytes=start-end` header
2. **Streams data** in chunks (8KB by default)
3. **Writes to file** at the correct offset using `seek`
4. **Reports progress** every 100ms via channels
5. **Handles errors** with automatic retry

```rust
// Simplified segment worker logic
async fn download_segment(segment: &Segment, file: &File) {
    let response = client.get(&url)
        .header("Range", format!("bytes={}-{}", start, end))
        .send().await?;
    
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        file.seek(SeekFrom::Start(current_position))?;
        file.write_all(&chunk)?;
        update_progress(chunk.len());
    }
}
```

### Pause & Resume

**Pausing a download:**
1. Cancels all segment worker tasks
2. Saves current progress to SQLite immediately
3. Each segment records its `downloaded_bytes`

**Resuming a download:**
1. Loads segment progress from SQLite
2. Restarts workers from where they left off
3. Uses `Range: bytes=current-end` header

```
Before pause:     [=========>          ] Segment 1: 40%
After resume:     Segment resumes from byte 40%
                  [          >---------]
```

### Speed Limiting

DLMan uses a **token bucket** algorithm for smooth speed limiting:

```
                    ┌─────────────────────────────┐
                    │        Token Bucket          │
                    │  Capacity: speed_limit bytes │
                    │  Refill: speed_limit/sec     │
                    └─────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
    ┌─────────┐            ┌─────────┐            ┌─────────┐
    │Segment 1│            │Segment 2│            │Segment 3│
    │ Request │            │ Request │            │ Request │
    │ tokens  │            │ tokens  │            │ tokens  │
    └─────────┘            └─────────┘            └─────────┘
```

Speed limits can be set at multiple levels:
1. **Per-download** - Highest priority
2. **Per-queue** - Applied to all downloads in queue
3. **Global** - App-wide limit

### Crash Recovery

DLMan persists state to SQLite after every chunk:

```sql
-- Segment progress is saved continuously
UPDATE segments 
SET downloaded_bytes = 157286400
WHERE download_id = ? AND segment_index = ?
```

On restart:
1. Load incomplete downloads from SQLite
2. Check which segments are incomplete
3. Resume from last saved position

## Queue Scheduler

### How It Works

The `QueueScheduler` runs as a background task, checking schedules every 30 seconds:

```rust
pub struct QueueScheduler {
    queue_manager: Arc<QueueManager>,
    download_manager: Arc<DownloadManager>,
}

impl QueueScheduler {
    pub fn start(self: Arc<Self>) {
        tokio::spawn(async move {
            loop {
                self.check_schedules().await;
                tokio::time::sleep(Duration::from_secs(30)).await;
            }
        });
    }
}
```

### Schedule Checking

```
Every 30 seconds:
    │
    ├─ For each queue with schedule.enabled = true:
    │   │
    │   ├─ Is current day in schedule.days?
    │   │   └─ No → Skip
    │   │
    │   ├─ Is current time >= start_time?
    │   │   └─ Yes → Start queue
    │   │
    │   └─ Is current time >= stop_time?
    │       └─ Yes → Stop queue
```

### Time Until Next Start

The scheduler can calculate when a queue will next start:

```rust
pub fn time_until_next_start(schedule: &Schedule) -> Option<Duration> {
    // Find next day in schedule.days that matches
    // Calculate seconds until start_time on that day
}
```

This powers the countdown display in the UI sidebar.

## Post-Download Actions

When a queue completes all downloads:

| Action | What Happens |
|--------|--------------|
| `None` | Nothing |
| `Notify` | OS notification |
| `Sleep` | Put computer to sleep |
| `Shutdown` | Shutdown computer |
| `Hibernate` | Hibernate computer |
| `RunCommand(cmd)` | Execute shell command |

Implementation uses platform-specific commands:
- **macOS**: `pmset sleepnow`, `osascript` for shutdown
- **Windows**: `shutdown /s`, `rundll32 powrprof.dll`
- **Linux**: `systemctl suspend`, `systemctl poweroff`
