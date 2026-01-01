# DLMan Fixes and Improvements Needed

## ✅ FIXED Issues (January 2026) - Round 2

### Progress/Speed Not Showing During Download
**Problem**: Main progress bar and speed weren't displaying during active downloads. Only segment progress was visible.

**Root Cause**: 
1. `total_downloaded` counter was initialized from `download.downloaded` which wasn't properly synced with segment progress
2. No initial progress event was emitted when starting/resuming

**Fix Applied**:
1. **Calculate `total_downloaded` from segments** - When resuming, sum all segment.downloaded values
2. **Emit initial progress event** immediately when starting so UI shows current state
3. **Emit `DownloadUpdated` on completion** with all segments marked complete

### Progress Resets on Resume
**Problem**: Progress bar would show 0% when resuming even though segments had downloaded data.

**Root Cause**: The `total_downloaded` atomic was initialized from `download.downloaded` which wasn't updated frequently enough.

**Fix Applied**: Initialize `total_downloaded` by summing all segment.downloaded values, which is always accurate.

### Segments Show Incomplete After Download Finishes
**Problem**: After download completed, UI showed segments as not fully complete.

**Fix Applied**: 
1. Mark all segments complete before emitting final status
2. Emit `DownloadUpdated` event after completion with final segment states

---

## ✅ FIXED Issues (January 2026) - Round 1

### UI Lock/Freeze During Download
**Problem**: When adding a download, the UI would freeze and become unresponsive. Users couldn't see progress or click the pause button.

**Root Cause**: The `add_download` command was making a **blocking HTTP HEAD request** (URL probe) before adding the download. This blocked the entire UI until the network request completed.

**Fix Applied**:
1. **Removed synchronous URL probing from `add_download`** - Downloads are now added immediately with status "Queued"
2. **URL probing now happens lazily** when the download actually starts (in the background task)
3. **Auto-start of queued downloads is now spawned** in a background task (non-blocking)
4. **Added `DownloadUpdated` event emission** after probing so UI gets size/metadata updates

### Progress Bar Not Updating
**Problem**: Multi-segment download progress wasn't visible in the UI.

**Fix Applied**:
1. **Emit `DownloadUpdated` event** after probing/initialization so frontend gets the file size and segments
2. **Progress events are already throttled** at 500ms intervals (no change needed)

### Pause Button Unresponsive
**Problem**: Clicking pause during download initialization had no effect.

**Fix Applied**:
1. **Added early pause/cancel checks** at the start of download task `run()`
2. **Added pause/cancel checks after URL probe** (which might take time due to slow servers)
3. The download now responds to pause/cancel at every stage of initialization

### Database Query Performance (N+1 Problem)
**Problem**: Loading downloads with segments made N+1 database queries (one per download for segments).

**Fix Applied**:
1. **Optimized `load_all_downloads`** - Now loads all segments in a single query and groups them in memory
2. **Optimized `get_downloads_by_queue`** - Same optimization for queue-filtered queries

### Cleaned Up Old Files
- Removed `download_old.rs`, `lib_old.rs`, `queue_old.rs` (old backup files)
- Removed `download.rs` (unused alternative implementation)

---

## Overview
Since the latest commit, we identified and attempted to fix several critical issues with the download manager's queue and pause functionality. The main problems were around queue management, moving downloads between queues, and the global pause feature.

## Issues Identified

### 1. Pause All Functionality
**Problem**: The "Pause All" button was not pausing all active downloads. It only paused downloads that were currently in "Downloading" status, missing:
- Downloads that were "Queued" (waiting to start)
- Downloads that were "Pending" 
- Downloads started manually outside of queue management

**What we wanted**: Pause All should pause ALL active downloads regardless of how they were started or their current status (Downloading, Queued, Pending).

**Attempted fix**: Updated `pause_all_downloads` command in `apps/desktop/src-tauri/src/commands.rs` to pause downloads with status: Downloading, Queued, or Pending.

### 2. Start Queue Functionality  
**Problem**: When starting a queue, it wasn't starting all eligible downloads in that queue. The logic excluded downloads that were already "Downloading", but we wanted it to start:
- Paused downloads
- Failed downloads (reset and retry)
- Pending downloads
- Queued downloads
- Cancelled downloads (potentially)

**What we wanted**: Start Queue should attempt to start/resume ALL non-completed downloads in the queue, up to the queue's `max_concurrent` limit, respecting queue speed limits.

**Attempted fix**: Updated the filter in `crates/dlman-core/src/queue.rs` in the `start_queue` method to include all downloads except Completed, Downloading, and Deleted. Added logic to reset failed downloads for retry.

### 3. Moving Downloads Between Queues
**Problem**: When dragging downloads from one queue (e.g., Default) to another custom queue:
- The `queue_id` wasn't being updated in the backend
- Starting the destination queue wouldn't start the moved downloads
- Queue assignments weren't persisting properly

**What we wanted**: 
- Drag and drop should update the download's `queue_id` 
- Changes should persist to storage
- Starting any queue should start all its downloads
- Queue speed limits should be applied correctly when moving

**Attempted fix**:
- Added `move_downloads` Tauri command in `apps/desktop/src-tauri/src/commands.rs`
- Registered it in `apps/desktop/src-tauri/src/lib.rs`
- Updated frontend `DndProvider.tsx` to call the backend command when dropping downloads on queues
- The core `move_downloads` method already existed and updates storage

### 4. Queue State Management
**Problem**: Queues weren't updating their state properly when downloads were moved between them. Starting a queue only affected downloads originally in that queue.

**What we wanted**: Queue operations should be based on current `queue_id` assignments, not historical ones.

**Attempted fix**: Ensured `move_downloads` updates the `queue_id` and persists it, so subsequent queue operations work correctly.

## Additional Issues Noted
- Build warnings for unused code (dead code, unused variables)
- Error handling for resume operations (file not found errors)
- UI feedback for failed operations (reverting local state on backend errors)

## Files Modified
- `apps/desktop/src-tauri/src/commands.rs`: Added `move_downloads`, updated `pause_all_downloads`
- `apps/desktop/src-tauri/src/lib.rs`: Registered `move_downloads` command
- `apps/desktop/src/components/dnd/DndProvider.tsx`: Added backend call for queue moves
- `crates/dlman-core/src/queue.rs`: Updated `start_queue` filter

## Testing Needed
- Test Pause All with various download states
- Test Start Queue after moving downloads between queues
- Test drag and drop persistence across app restarts
- Test queue speed limit application after moves</content>
<parameter name="filePath">/Users/shayanmoradi/Desktop/Work/opendm/FIXES_NEEDED.md