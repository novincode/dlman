# Changelog

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

