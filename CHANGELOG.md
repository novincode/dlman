# Changelog

All notable changes to DLMan will be documented in this file.

## [1.3.0] - 2026-01-02

### 🎉 Major Changes

#### SQLite-Based Settings Storage
- **Settings are now stored in SQLite** instead of JSON files
- Single source of truth for all app settings
- Frontend syncs with backend on startup
- More reliable and consistent across restarts

#### Configurable Segment Count
- **Segment count now properly uses app settings**
- Change `default_segments` in Settings to control number of parallel connections
- Segments work correctly for new downloads
- Existing downloads retain their segment count on resume

### ✨ New Features

- **Per-download speed limits** - Override queue speed limit for individual downloads
- **Automatic retry** - Failed downloads retry automatically with configurable delay
- **Improved segment visualization** - See each connection's progress in real-time

### 🐛 Bug Fixes

- Fixed UI freezing during downloads (async progress updates)
- Fixed queue speed limit not applying to new downloads
- Fixed downloads getting stuck after pause/resume
- Fixed Cmd+Q opening Queue Manager instead of quitting (now uses Cmd+Shift+Q)
- Fixed segment count always showing 4 regardless of settings

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘N | New Download |
| ⌘⇧I | Batch Import |
| ⌘, | Settings |
| ⌘⇧Q | Queue Manager |
| ⌘A | Select All |
| Esc | Clear Selection |
| ⌘V | Paste URL |

### 🏗️ Technical Changes

- Refactored settings storage from JSON to SQLite
- Added `settings` table to SQLite schema
- Frontend now loads settings from backend on startup
- Removed unused JSON settings file handling
- Improved logging for debugging settings sync

## [1.1.0] - 2025-12-15

### Features
- Multi-segment parallel downloads
- Queue management with speed limits
- Pause/resume support
- Dark/light theme support
- Drag and drop URL import

## [1.0.0] - 2025-12-01

### Initial Release
- Core download engine
- Desktop app with React UI
- CLI tool
- Basic queue support
