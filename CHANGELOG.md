# Changelog

## [1.9.0] - 2026-02-10

### ✨ New Features

**Site Logins & Saved Credentials**
- Save site login credentials per domain (IDM-inspired)
- Auto-apply saved credentials for authenticated downloads (HTTP Basic Auth)
- Auth detection during URL probe — amber warning shown in New Download dialog before starting
- Credential prompt dialog on 401/403 failures with "Sign In & Retry"
- Pre-fills existing credentials when they fail, with warning to update
- "Saved Logins" tab in Settings with full CRUD management
- Enable/disable individual credentials without deleting

**Queue Auto-Advance**
- Queue manager now automatically starts the next pending downloads when active ones complete
- Fills all available queue slots (respects max concurrent limit)
- Background listener watches for status changes in real-time

**Clear Filters Button**
- "Clear" button appears in the filter bar when any filter is active
- Resets status, queue, category, and search filters in one click
- Only shown when needed — hidden when all filters are at defaults

### 🐛 Bug Fixes
- Fixed critical overflow panic when downloading from auth-required URLs (size=0 causing u64 underflow)
- Fixed auth-required URLs not being detected during probe — now properly returns 401/403 status
- Fixed extension manifest version out of sync with app version

### 🎨 UI/UX Improvements
- Replaced native HTML `<select>` with shadcn `<Select>` component in Settings credential form
- Auth warning banner with shield icon in New Download dialog for protected URLs
- "Saved Logins" button in auth warning opens Settings directly

## [1.8.2] - 2026-01-07

### 🐛 Bug Fixes
- **Fixed critical overflow panic for unknown-size downloads**: Downloads from sources without Content-Length headers (like GitHub archives) now complete successfully instead of crashing
- **Fixed UI display issues for streaming downloads**: Segment progress bars and sizes now properly handle unknown-size downloads with "streaming" indicators
- **Added indeterminate progress animation**: Unknown-size downloads now show animated progress bars instead of stuck at 0%

### 🔧 Technical
- Improved merge logic to use actual file sizes for unknown-size downloads
- Enhanced segment worker to properly track and update download sizes when discovered during streaming
- Added safe arithmetic operations to prevent overflow in segment calculations

## [1.8.1] - 2026-01-07

### 🐛 Bug Fixes
- Fixed "delete file from disk" not actually deleting files - status was being changed to cancelled before checking if completed
- Fixed bulk delete not offering file deletion option - now properly checks for files on disk
- Fixed Linux build failing due to `open_devtools` not available in release builds

### 🔧 Technical
- File deletion now logs success/failure and continues with download removal even if file deletion fails
- Added proper `devtools` feature flag for Tauri builds

## [1.8.0] - 2026-01-07

### ✨ New Features
- Toast notification filtering: Users can now disable success, error, or info notifications in Settings
- Toast auto-dismiss: All notifications automatically dismiss after 3 seconds

### 🐛 Bug Fixes
- Fixed browser extension connection detection on macOS - now uses real-time pings instead of cached status
- Fixed UUID parsing error when adding single downloads - resolved issue with legacy category data stored as names instead of UUIDs

### 🎨 UI/UX Improvements
- Simplified dev menu - removed duplicate reset options
- Added "In-App Toasts" section in Settings dialog with granular notification controls

## [1.7.5] - 2026-01-06

### 🐛 Bug Fixes
- Fixed "delete download with file" not working - parameter name mismatch (deleteFile → delete_file)
- Speed limit slider in Download Info dialog now shows MB/s and GB/s instead of just KB/s
- Fixed Firefox extension not detecting desktop app connection
- Extension popup now auto-retries connection when opened
- Retry button in extension now properly updates UI state after reconnecting

## [1.7.4] - 2026-01-06

### 🐛 Bug Fixes
- Fixed DownloadInfoDialog scroll overflow on Windows
- Fixed batch import auto-starting downloads regardless of "Start immediately" setting
- Downloads now properly respect the start immediately toggle - when disabled, downloads stay in queued state
- Fixed emoji display on Windows - replaced with cross-platform Lucide icons for support reminder
- Improved release workflow to properly extract and display changelog in GitHub releases

## [1.7.3] - 2026-01-06

### 🐛 Bug Fixes
- **Fixed duplicate tray icons on macOS**: Tray icons no longer multiply when reloading the app. The system now properly reuses existing tray icons instead of creating duplicates.
- Fixed SupportReminder links not opening in Tauri context (now uses shell.open API)

### 🎨 UI Enhancements
- Added icons to FilterBar "All" states (Activity for status, ListTodo for queues, Folder for categories)
- Enhanced SupportReminder component with larger text and better positioning
- Category icons now display correctly in sidebar (Music, Videos, Documents, etc.)

## [1.7.2] - 2026-01-05

### 🐛 Bug Fixes
- Fixed race condition in download manager preventing multiple concurrent starts
- Fixed move_download_file parameter naming (snake_case for backend)
- Added DevTools toggle shortcut (Cmd+Alt+D) when dev mode enabled
- Fixed add_download dependency array in NewDownloadDialog
- Emit DownloadUpdated event after moving file to keep UI in sync

## [1.7.0] - 2025-01-26

### ✨ New Features

**App Badge for Active Downloads**
- macOS dock badge shows count of active downloads
- Clear indicator when downloads are in progress

**Console Log Management**
- Per-type log limits (info, warn, error, debug)
- Configurable limits in Settings > Advanced (dev mode)
- Prevents memory bloat from excessive logging

**Selection Mode Improvements**
- Checkboxes only appear when in selection mode
- Right-click "Select" option to enter selection mode
- Cleaner list appearance by default

### 🎨 UI Enhancements
- Improved download loading animation (lightweight CSS spinner)
- Wider sidebar with better overflow handling
- Dialogs now properly block interaction behind them
- Play/pause buttons feel instant with optimistic updates

### ⚡ Performance
- Segments now use cached CDN URL to avoid redirect overhead on resume
- Reduced HTTP requests when resuming downloads from GitHub/CDN sources

### 🐛 Bug Fixes
- Fixed download status not updating when starting immediately
- Fixed keyboard shortcuts firing through open dialogs
- Fixed sidebar horizontal overflow issues

## [1.5.0] - 2026-01-04

### ✨ New Features

**Queue Scheduling**
- Schedule queues to start/stop at specific times
- Select active days of the week
- Countdown timer shows time until next scheduled start
- Background scheduler automatically starts/stops queues

**Auto-Updates**
- In-app update notifications with badge indicator
- One-click update download and install
- Version check on startup and manual refresh

**Post-Download Actions**
- Execute actions when queue completes: Sleep, Shutdown, Hibernate
- Run custom commands after downloads finish
- Native OS notifications for download events

**Batch Import Improvements**
- Drag & drop multiple URLs at once
- Parse URLs from clipboard (supports various formats)
- HTML page detection and filtering
- Remember preferences (hide HTML, start immediately)

**Network Monitoring**
- Real-time network usage graph in sidebar
- Upload/download speed visualization
- Current connection speed display

### 🎨 UI Enhancements
- Redesigned MenuBar with smart context menus
- Keyboard shortcuts for time picker (arrows, number input)
- Auto-select current queue when adding downloads
- Improved About dialog placement
- Better queue list with schedule indicators

### 🐛 Bug Fixes
- Queue schedule weekdays now save correctly
- System tray icon permissions fixed
- Notification permissions improved
- Fixed various serialization issues

### 📚 Documentation
- Expanded macOS installation guide
- Added troubleshooting section
- Updated architecture documentation

## [1.3.1] - 2026-01-02

### Fixed
- Toast notifications now respect dark/light theme system preference
- Windows "Open Folder" opening wrong directory
- Speed limiter preventing multi-segment bursting
- Duplicate toast notifications appearing
- Sidebar download title overflow truncation
- NewDownloadDialog not re-probing URL on reopen
- Cmd+Shift+Q shortcut conflicting with macOS

### Added
- Confirmation dialog for "Clear Completed" action with blue button
- System theme detection and reactive updates for notifications

## [1.3.0] - 2026-01-02

### Changed
- Settings now stored in SQLite (single source of truth)
- Segment count uses app settings properly

### Added
- Per-download speed limits
- Auto-retry for failed downloads
- Real-time segment visualization

### Fixed
- UI freezing during downloads
- Queue speed limits not applying
- Pause/resume issues
- Segment count ignoring settings

## [1.1.0] - 2025-12-15

- Multi-segment parallel downloads
- Queue management with speed limits
- Pause/resume support
- Dark/light themes
- Drag and drop

## [1.0.0] - 2025-12-01

- Initial release

