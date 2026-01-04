# Changelog

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

