# DLMan Architecture

> System design documentation for DLMan v1.3.0+

## Project Structure

```
dlman/
├── apps/
│   ├── desktop/                 # Tauri + React desktop app
│   │   ├── src/                 # React frontend
│   │   │   ├── components/      # UI components
│   │   │   │   ├── ui/          # shadcn/ui components
│   │   │   │   ├── layout/      # Layout components
│   │   │   │   ├── dialogs/     # Modal dialogs
│   │   │   │   ├── sidebar/     # Sidebar components
│   │   │   │   └── downloads/   # Download-related components
│   │   │   ├── stores/          # Zustand stores
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── lib/             # Utilities and helpers
│   │   │   ├── types/           # TypeScript types
│   │   │   └── styles/          # Global styles
│   │   ├── src-tauri/           # Tauri Rust backend
│   │   │   ├── src/
│   │   │   │   ├── commands.rs  # Tauri commands
│   │   │   │   └── lib.rs       # Main library
│   │   │   └── Cargo.toml
│   │   └── package.json
│   │
│   └── cli/                     # CLI application
│       ├── src/
│       │   └── main.rs
│       └── Cargo.toml
│
├── crates/
│   ├── dlman-core/              # Core download engine
│   │   ├── src/
│   │   │   ├── engine/          # Download engine
│   │   │   │   ├── persistence.rs  # SQLite database (downloads, segments, settings)
│   │   │   │   ├── manager.rs      # Download manager
│   │   │   │   ├── download_task.rs
│   │   │   │   ├── segment_worker.rs
│   │   │   │   └── rate_limiter.rs
│   │   │   ├── queue.rs         # Queue management
│   │   │   ├── storage.rs       # JSON storage for queues
│   │   │   ├── error.rs
│   │   │   └── lib.rs
│   │   └── Cargo.toml
│   │
│   └── dlman-types/             # Shared types
│       ├── src/
│       │   └── lib.rs
│       └── Cargo.toml
│
├── docs/
│   ├── VISION.md                # Project vision
│   ├── ARCHITECTURE.md          # This file
│   ├── CORE.md                  # Download engine docs
│   ├── CLI.md                   # CLI documentation
│   └── AI_GUIDELINES.md         # Guidelines for AI assistants
│
├── Cargo.toml                   # Workspace Cargo.toml
├── pnpm-workspace.yaml          # pnpm workspace config
├── package.json                 # Root package.json
└── README.md
```

## 🔧 Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI Framework |
| TypeScript | Type Safety |
| Tailwind CSS | Styling |
| shadcn/ui | Component Library |
| Zustand | State Management |
| Framer Motion | Animations |
| @dnd-kit | Drag and Drop |
| TanStack Virtual | List Virtualization |

### Backend (Rust)
| Technology | Purpose |
|------------|---------|
| Tauri v2 | Desktop Framework |
| tokio | Async Runtime |
| reqwest | HTTP Client |
| sqlx | Database (SQLite) |
| serde | Serialization |
| thiserror | Error Handling |

## 🏛️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Desktop App                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    React Frontend                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │ Sidebar │ │Downloads│ │ Dialogs │ │Settings │        │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘        │   │
│  │       │           │           │           │              │   │
│  │  ┌────┴───────────┴───────────┴───────────┴────┐        │   │
│  │  │              Zustand Stores                  │        │   │
│  │  │  downloads | queues | settings | ui          │        │   │
│  │  └──────────────────┬───────────────────────────┘        │   │
│  └─────────────────────┼────────────────────────────────────┘   │
│                        │ Tauri IPC                               │
│  ┌─────────────────────┼────────────────────────────────────┐   │
│  │                Tauri Backend                              │   │
│  │  ┌──────────────────┴───────────────────────────┐        │   │
│  │  │              Commands & Events                │        │   │
│  │  └──────────────────┬───────────────────────────┘        │   │
│  │                     │                                     │   │
│  │  ┌──────────────────┴───────────────────────────┐        │   │
│  │  │              dlman-core                       │        │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐         │        │   │
│  │  │  │Download │ │ Queue   │ │ Storage │         │        │   │
│  │  │  │ Engine  │ │ Manager │ │  Layer  │         │        │   │
│  │  │  └─────────┘ └─────────┘ └─────────┘         │        │   │
│  │  └──────────────────────────────────────────────┘        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                           CLI                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    dlman-core                             │   │
│  │  (Same core library, different interface)                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 📊 Data Models

### Download
```rust
pub struct Download {
    pub id: Uuid,
    pub url: String,
    pub final_url: Option<String>,  // After redirects
    pub filename: String,
    pub destination: PathBuf,
    pub size: Option<u64>,
    pub downloaded: u64,
    pub status: DownloadStatus,
    pub segments: Vec<Segment>,
    pub queue_id: Uuid,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

pub enum DownloadStatus {
    Pending,
    Downloading,
    Paused,
    Completed,
    Failed,
    Queued,
}
```

### Queue
```rust
pub struct Queue {
    pub id: Uuid,
    pub name: String,
    pub color: String,
    pub icon: Option<String>,  // Path or emoji
    pub max_concurrent: u32,
    pub speed_limit: Option<u64>,  // bytes/sec
    pub schedule: Option<Schedule>,
    pub post_action: PostAction,
    pub created_at: DateTime<Utc>,
}

pub struct Schedule {
    pub enabled: bool,
    pub start_time: Option<NaiveTime>,
    pub stop_time: Option<NaiveTime>,
    pub days: Vec<Weekday>,
}

pub enum PostAction {
    None,
    Shutdown,
    Sleep,
    Hibernate,
    Notify,
    RunCommand(String),
}
```

### Settings
```rust
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
    pub max_retries: u32,
    pub retry_delay_seconds: u32,
}

pub enum Theme {
    Light,
    Dark,
    System,
}
```

## 💾 Data Storage (v1.3.0+)

### SQLite as Single Source of Truth

All persistent data is stored in SQLite (`downloads.db`):

| Table | Purpose |
|-------|---------|
| `downloads` | Download records with metadata |
| `segments` | Per-download segment progress |
| `settings` | Application settings (single row) |

**Queues** are still stored as JSON files for flexibility.

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Zustand Stores (in-memory)              │    │
│  │   downloads | queues | settings (synced from SQLite) │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │ Tauri IPC                        │
│  ┌────────────────────────┴────────────────────────────┐    │
│  │                 Tauri Commands                       │    │
│  │  get_settings() / update_settings()                  │    │
│  │  get_downloads() / add_download() / ...              │    │
│  └────────────────────────┬────────────────────────────┘    │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                     Backend (Rust)                           │
│  ┌────────────────────────┴────────────────────────────┐    │
│  │               DlmanCore (dlman-core)                 │    │
│  │   ┌──────────────────────────────────────────────┐  │    │
│  │   │        DownloadDatabase (persistence.rs)      │  │    │
│  │   │  ┌─────────┐ ┌──────────┐ ┌──────────┐       │  │    │
│  │   │  │downloads│ │ segments │ │ settings │       │  │    │
│  │   │  └─────────┘ └──────────┘ └──────────┘       │  │    │
│  │   └──────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                     SQLite (downloads.db)                    │
└──────────────────────────────────────────────────────────────┘
```

### Frontend Settings Sync

On app startup:
1. Frontend calls `get_settings()` Tauri command
2. Backend loads settings from SQLite
3. Frontend updates Zustand store with backend values
4. **SQLite is always the source of truth**

When user changes settings:
1. Frontend updates Zustand store
2. Frontend calls `update_settings()` Tauri command
3. Backend saves to SQLite

## 🔄 Event System

### Rust → Frontend Events
```rust
// Progress updates (throttled to 100ms)
DownloadProgress { id, downloaded, speed, eta }

// Status changes
DownloadStatusChanged { id, status, error? }

// Queue events
QueueStarted { id }
QueueCompleted { id }
QueueItemAdded { queue_id, download_id }

// System events
Error { message, context }
```

### Frontend → Rust Commands
```rust
// Download commands
add_download(url, destination, queue_id) -> Download
pause_download(id) -> ()
resume_download(id) -> ()
cancel_download(id) -> ()
delete_download(id, delete_file: bool) -> ()

// Queue commands
create_queue(name, options) -> Queue
update_queue(id, options) -> Queue
delete_queue(id) -> ()
start_queue(id) -> ()
stop_queue(id) -> ()

// Bulk operations
import_links(links: Vec<String>) -> Vec<LinkInfo>
move_downloads(ids: Vec<Uuid>, queue_id: Uuid) -> ()

// Settings
get_settings() -> Settings
update_settings(settings) -> ()
export_data() -> String
import_data(data: String) -> ()
```

## 🎨 UI Component Architecture

### Layout
```
┌────────────────────────────────────────────────────────────┐
│  Menu Bar (Add | Remove | Queues | Settings)               │
├────────────┬───────────────────────────────────────────────┤
│            │  Filter Bar (All | Active | Completed | ...)  │
│   Sidebar  ├───────────────────────────────────────────────┤
│            │                                               │
│  - Queues  │             Download List                     │
│  - Folders │         (Virtualized, Sortable)               │
│  - Active  │                                               │
│            │                                               │
├────────────┴───────────────────────────────────────────────┤
│  Dev Console (collapsible, dev mode only)                  │
└────────────────────────────────────────────────────────────┘
```

### Component Hierarchy
```
App
├── Layout
│   ├── MenuBar
│   ├── MainContent
│   │   ├── Sidebar (resizable)
│   │   │   ├── QueueTree
│   │   │   ├── FolderTree
│   │   │   └── ActiveDownloads
│   │   └── ContentArea
│   │       ├── FilterBar
│   │       └── DownloadList (virtualized)
│   └── DevConsole (conditional)
├── Dialogs
│   ├── NewDownloadDialog
│   ├── BatchImportDialog
│   ├── QueueManagerDialog
│   ├── SettingsDialog
│   └── ConfirmDialog
└── ContextMenus
    ├── DownloadContextMenu
    ├── QueueContextMenu
    └── SidebarContextMenu
```

## 🔒 Error Handling

### Rust Errors
```rust
#[derive(Debug, thiserror::Error)]
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
}
```

### Frontend Error Handling
- All Tauri commands return `Result<T, String>`
- Errors displayed via toast notifications
- Critical errors show modal dialogs
- Network errors allow retry with exponential backoff

## 🚀 Performance Considerations

### Download Engine
- Segment size: 1MB minimum, adaptive based on file size
- Concurrent segments: 4-8 per file (configurable)
- Buffer size: 64KB for writes
- Progress throttling: 100ms intervals

### UI Performance
- Virtual scrolling for 1000+ items
- Debounced search/filter (300ms)
- Memoized components with React.memo
- Lazy loading for dialogs

### Memory Management
- Stream downloads to disk (no full file in memory)
- Limit concurrent downloads based on available memory
- Clean up completed segments immediately
