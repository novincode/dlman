# Plugin System Design Document

> Comprehensive design for a Blender/WordPress-style plugin system for DLMan
>
> Status: **RFC (Request for Comments)** — Not yet implemented
>
> Last updated: 2026-02-12

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Current Architecture Analysis](#2-current-architecture-analysis)
3. [Plugin Language Decision](#3-plugin-language-decision)
4. [Hook System Design](#4-hook-system-design)
5. [Plugin API Surface](#5-plugin-api-surface)
6. [UI Extension System](#6-ui-extension-system)
7. [Plugin Lifecycle & Management](#7-plugin-lifecycle--management)
8. [Implementation Plan & Phases](#8-implementation-plan--phases)
9. [Difficulty Assessment & Risks](#9-difficulty-assessment--risks)
10. [Comparisons: Blender, WordPress, VSCode](#10-comparisons-blender-wordpress-vscode)

---

## 1. Vision & Goals

### What We Want

A plugin system that lets **third-party developers** (and ourselves) extend DLMan at every level — from download behavior to UI — without modifying core code. Think:

- **Blender** — Python scripts that can add panels, operators, modify meshes, hook into render pipeline
- **WordPress** — PHP plugins that hook into actions/filters at every stage of content processing
- **VS Code** — Extensions that add commands, views, languages, debuggers via a rich API

### Why We Need It

| Problem | Plugin Solution |
|---------|----------------|
| Rapidgator/file-host auth needs site-specific logic | A "rapidgator-auth" plugin handles the login flow |
| YouTube/streaming download panel | A "video-grabber" plugin adds a video panel + extraction logic |
| Users want features we can't maintain | Community builds & maintains niche plugins |
| Core stays bloated with edge-case code | Core stays lean, plugins handle edge cases |
| Per-site download resolvers (indirect → direct links) | Plugins register URL resolvers per domain |

### Design Principles

1. **Plugins can't crash the app** — Sandboxed execution, graceful error handling
2. **Plugins are optional** — Core works 100% without any plugins
3. **Plugins are discoverable** — Enable/disable from Settings UI
4. **Plugins are composable** — Multiple plugins can coexist, hook into same events
5. **Plugins have permissions** — Declare what they need access to (network, filesystem, UI)
6. **Hot-reload in dev mode** — Plugin developers can iterate without restarting the app

---

## 2. Current Architecture Analysis

### What We Have Today

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Extension (WXT)                                     │
│  Reads cookies, intercepts downloads, sends to desktop       │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket (port 7899)
┌──────────────────────────▼──────────────────────────────────┐
│  Desktop App                                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  React Frontend (Zustand stores, shadcn/ui)            │  │
│  │  Downloads│Queues│Settings│Credentials│BatchImport│UI   │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │ Tauri IPC (invoke + listen)      │
│  ┌────────────────────────▼───────────────────────────────┐  │
│  │  Tauri Backend                                         │  │
│  │  commands.rs (40+ IPC commands)                        │  │
│  │  state.rs (AppState → DlmanCore)                       │  │
│  │  browser_server.rs (Axum WS for extension)             │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                   │
│  ┌────────────────────────▼───────────────────────────────┐  │
│  │  dlman-core                                            │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌───────────────┐  │  │
│  │  │DownloadMgr   │ │ QueueMgr     │ │ Scheduler     │  │  │
│  │  │DownloadTask  │ │ max_concurrent│ │ 30s tick      │  │  │
│  │  │SegmentWorker │ │ auto-advance │ │ time rules    │  │  │
│  │  │RateLimiter   │ │              │ │               │  │  │
│  │  └──────────────┘ └──────────────┘ └───────────────┘  │  │
│  │  ┌──────────────┐ ┌──────────────┐                    │  │
│  │  │ Storage      │ │ Persistence  │                    │  │
│  │  │ (JSON queues)│ │ (SQLite)     │                    │  │
│  │  └──────────────┘ └──────────────┘                    │  │
│  │                                                        │  │
│  │  CoreEvent broadcast channel (1000 capacity)           │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Existing Patterns That Help Us

Our architecture already has patterns that a plugin system can leverage:

| Pattern | Where | Plugin Opportunity |
|---------|-------|--------------------|
| **Broadcast event channel** | `DlmanCore::event_tx` | Plugins subscribe to ALL events |
| **Arc\<RwLock\> state** | All managers | Safe concurrent access from plugins |
| **Tauri IPC commands** | `commands.rs` | Plugins can register new commands |
| **Zustand stores** | Frontend | Plugins can add new stores |
| **PostAction enum** | Queue completion | Plugins can add custom post-actions |
| **SiteCredential matching** | `find_credentials_for_download()` | Plugins can add custom auth strategies |
| **reqwest Client** | `DownloadManager` | Plugins can modify request building |

### Key Files & Line Counts

| File | Lines | Plugin Relevance |
|------|-------|------------------|
| `crates/dlman-core/src/lib.rs` | 811 | **PRIMARY** — DlmanCore facade, all public methods |
| `crates/dlman-types/src/lib.rs` | 554 | All shared types, CoreEvent enum |
| `crates/dlman-core/src/engine/manager.rs` | 629 | Download start/stop, HTTP client |
| `crates/dlman-core/src/engine/download_task.rs` | 886 | Download lifecycle (probe → segment → merge) |
| `crates/dlman-core/src/engine/segment_worker.rs` | ~330 | HTTP request building, auth headers |
| `crates/dlman-core/src/engine/persistence.rs` | 736 | SQLite CRUD |
| `apps/desktop/src-tauri/src/commands.rs` | 779 | All Tauri IPC functions |
| `apps/desktop/src-tauri/src/state.rs` | 211 | AppState, event forwarding |
| `apps/desktop/src-tauri/src/browser_server.rs` | 517 | Extension WebSocket server |

### The Download Pipeline (Where Plugins Hook In)

```
URL Input → [1] URL Resolve → [2] Probe → [3] Pre-Download
    → [4] Segment Split → [5] HTTP Request Build → [6] On Chunk
    → [7] On Segment Complete → [8] Merge → [9] Post-Download
    → [10] Queue Advance
```

Each numbered stage is a potential **hook point** for plugins. Today, none of these stages are extensible — they're hardcoded in `download_task.rs` and `segment_worker.rs`.

---

## 3. Plugin Language Decision

### The Options

| Language | Used By | Pros | Cons |
|----------|---------|------|------|
| **Lua** | Neovim, Redis, Game engines | Tiny runtime (~200KB), blazing fast embed, great Rust integration (`mlua` crate) | Small ecosystem, no package manager culture, limited stdlib |
| **Python** | Blender, GIMP, Sublime Text | Massive ecosystem, everyone knows it, great for scripting | Heavy runtime (~30MB), GIL issues, hard to embed safely in Rust |
| **JavaScript** | VS Code, Figma, Obsidian | Everyone knows it, async-native, npm ecosystem | Needs V8/Deno/QuickJS runtime, complex embedding |
| **Rhai** | Rust-native scripting | Purpose-built for Rust embedding, safe, no unsafe FFI | Niche, small community, limited ecosystem |
| **Rust (dynamic)** | Bevy (ECS), Zed editor | Maximum performance, direct access to types | Requires compilation, ABI instability, terrible DX for plugin authors |
| **WASM** | Zed, Envoy, Shopify Functions | Sandboxed, polyglot (any lang → WASM), safe | Complex toolchain, limited I/O, debugging is painful |

### Recommendation: **Lua** (core) + **JavaScript** (UI extensions)

#### Why Lua for backend plugins?

1. **Blender proved the model works** — Blender uses Python, but Lua is the same idea with better Rust integration
2. **`mlua` crate** — Production-grade Lua 5.4 / LuaJIT embedding for Rust. Used by Neovim's Rust components
3. **Sandboxable** — We can remove `os.execute`, `io.open`, `loadfile` and only expose our API
4. **Tiny footprint** — ~200KB for the entire runtime, vs 30MB+ for Python
5. **Coroutine-friendly** — Lua coroutines map well to our async download pipeline
6. **Fast enough** — LuaJIT is ~10-50x faster than Python. Plugin code is glue logic, not compute
7. **Simple to learn** — Plugin authors don't need to know Rust. Lua is simpler than Python

#### Why JavaScript for UI plugins?

Our frontend is already React + TypeScript. UI plugins should speak the same language:

1. **Plugins define React components** that render in designated "slots" in the UI
2. **Loaded as ES modules** at runtime via dynamic `import()`
3. **Access Zustand stores** through a plugin API bridge
4. **Can use Tailwind classes** + shadcn/ui components we already ship

#### The Two-Layer Plugin Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  UI Layer (JavaScript/React)                                  │
│  • Custom panels, dialogs, sidebar sections                   │
│  • Communicates with backend plugin via Tauri events          │
│  • Renders in designated "plugin slots" in the UI             │
└──────────────────────────┬───────────────────────────────────┘
                           │ Tauri IPC bridge
┌──────────────────────────▼───────────────────────────────────┐
│  Backend Layer (Lua via mlua)                                 │
│  • Download hooks (pre-download, post-download, URL resolve)  │
│  • Custom auth strategies                                     │
│  • Event listeners and emitters                               │
│  • Network requests (via exposed Rust functions)              │
│  • File system access (sandboxed to plugin directory)         │
│  • Plugin-to-plugin communication                             │
└──────────────────────────────────────────────────────────────┘
```

#### Alternative Considered: Python

Python would be the "obvious" choice (Blender uses it), but:

- **Embedding Python in Rust is painful** — `pyo3` works but adds ~30MB to binary size
- **Python's GIL** conflicts with our async Tokio runtime
- **Distribution** — Users would need Python installed, or we bundle it (huge binary)
- **Startup time** — Python interpreter startup is 50-200ms vs Lua's <1ms

Lua gives us 90% of the benefit at 10% of the cost.

#### Alternative Considered: WASM

WASM would be the most "correct" choice for sandboxing, but:

- **Plugin DX is terrible** — Authors must compile to WASM, set up toolchains
- **No direct filesystem/network access** — Everything goes through host functions
- **Debugging is awful** — No good source-map story for WASM plugins
- **Overkill** — We're not running untrusted code from the internet (at least not yet)

If we ever add a **plugin marketplace with auto-install**, WASM becomes the right choice for security. Until then, Lua is pragmatic.

---
## 4. Hook System Design

### Core Concept: Actions & Filters

Inspired by WordPress, we have two types of hooks:

- **Actions** — "Something happened, react to it" (fire-and-forget)
- **Filters** — "Transform this data before it's used" (returns modified data)

### All Hook Points

#### Download Pipeline Hooks

| Hook | Type | When | What Plugin Receives | What Plugin Can Do |
|------|------|------|---------------------|-------------------|
| `on_url_added` | Filter | URL entered by user | `{url, source}` | Rewrite URL, reject it, add metadata |
| `on_url_resolve` | Filter | Before probe | `{url, domain, credentials}` | Resolve indirect → direct URL, inject auth |
| `on_probe_request` | Filter | Building probe HTTP request | `{url, headers, method}` | Add headers, change method, add cookies |
| `on_probe_response` | Filter | After probe response | `{url, status, headers, filename, size}` | Override filename, size, final_url |
| `on_download_start` | Action | Download begins | `{download}` | Log, notify, validate |
| `on_request_build` | Filter | Building segment HTTP request | `{url, headers, range, segment_index}` | Add auth headers, custom headers, cookies |
| `on_chunk_received` | Action | Each chunk downloaded | `{download_id, segment, bytes_len}` | Progress tracking, content inspection |
| `on_segment_complete` | Action | A segment finishes | `{download_id, segment_index, bytes}` | Verification, logging |
| `on_download_complete` | Action | All segments merged, file ready | `{download, file_path}` | Post-processing, virus scan, move file, notify |
| `on_download_failed` | Action | Download errored | `{download, error, retry_count}` | Custom retry logic, error reporting |
| `on_download_cancel` | Action | User cancelled | `{download}` | Cleanup |

#### Authentication Hooks

| Hook | Type | When | Data | Can Do |
|------|------|------|------|--------|
| `on_auth_required` | Filter | 401/403 received | `{url, domain, status_code}` | Return credentials, trigger custom auth flow |
| `on_auth_challenge` | Filter | Server sends WWW-Authenticate | `{url, scheme, realm, params}` | Handle Digest auth, Bearer, custom schemes |
| `on_credentials_lookup` | Filter | Looking up saved creds for domain | `{url, domain, found_credentials}` | Override credentials, add session tokens |

#### Queue & Scheduler Hooks

| Hook | Type | When | Data | Can Do |
|------|------|------|------|--------|
| `on_queue_advance` | Filter | About to start next download | `{queue, pending_downloads}` | Reorder, skip, delay |
| `on_queue_complete` | Action | All downloads in queue finished | `{queue, downloads}` | Custom post-actions |
| `on_schedule_tick` | Action | Every 30s scheduler tick | `{queues, time}` | Custom scheduling logic |

#### Application Lifecycle Hooks

| Hook | Type | When | Data | Can Do |
|------|------|------|------|--------|
| `on_app_start` | Action | App initialized | `{version, settings}` | Plugin init, migration |
| `on_app_shutdown` | Action | App closing | `{}` | Cleanup, save state |
| `on_settings_changed` | Action | Settings updated | `{old_settings, new_settings}` | React to config changes |

### Hook Execution Model

```
Filter Chain (like middleware):

  Input Data
      │
      ▼
  Plugin A: on_url_resolve (priority: 10)
      │ returns modified data (or unchanged)
      ▼
  Plugin B: on_url_resolve (priority: 20)
      │ returns modified data (or unchanged)
      ▼
  Plugin C: on_url_resolve (priority: 50)
      │ returns modified data (or unchanged)
      ▼
  Final Data → used by core engine
```

```
Action Chain (fire-and-forget):

  Event happens
      │
      ├──► Plugin A: on_download_complete (async)
      ├──► Plugin B: on_download_complete (async)
      └──► Plugin C: on_download_complete (async)
      
  All run concurrently, errors are logged but don't block
```

### Rust-Side Hook Registry

```rust
// Conceptual — not final implementation

pub struct HookRegistry {
    filters: HashMap<String, Vec<HookHandler>>,
    actions: HashMap<String, Vec<HookHandler>>,
}

struct HookHandler {
    plugin_id: String,
    priority: i32,          // Lower = runs first (WordPress convention)
    lua_function_ref: LuaRegistryKey,
}

impl HookRegistry {
    /// Run all filter handlers in priority order, each transforms the value
    pub async fn apply_filter(&self, hook: &str, value: LuaValue) -> LuaValue;
    
    /// Run all action handlers concurrently
    pub async fn run_action(&self, hook: &str, data: LuaValue);
}
```

### Lua-Side Hook Registration

```lua
-- Plugin: rapidgator-auth/init.lua

local dlman = require("dlman")

-- Register a filter on URL resolution
dlman.add_filter("on_url_resolve", 10, function(data)
    if not string.match(data.domain, "rapidgator") then
        return data  -- not our domain, pass through
    end
    
    -- Use stored credentials to resolve the real download URL
    local creds = dlman.get_credentials(data.domain)
    if not creds then return data end
    
    local response = dlman.http.post("https://rapidgator.net/api/file/download", {
        body = { sid = creds.session_id, url = data.url },
        headers = { ["Content-Type"] = "application/json" }
    })
    
    if response.status == 200 then
        data.url = response.json.download_url
        data.resolved = true
    end
    
    return data
end)

-- Register an action on download complete
dlman.add_action("on_download_complete", function(data)
    dlman.log.info("Download finished: " .. data.download.filename)
    dlman.notify("Download Complete", data.download.filename)
end)
```

---

## 5. Plugin API Surface

### What Plugins Can Access

The `dlman` Lua module exposes controlled access to core functionality. Plugins NEVER get raw access to Rust internals — everything goes through this API.

### 5.1 Hook Registration

```lua
dlman.add_filter(hook_name, priority, callback)   -- Register a filter
dlman.add_action(hook_name, priority, callback)    -- Register an action  
dlman.remove_filter(hook_name, callback)           -- Unregister a filter
dlman.remove_action(hook_name, callback)           -- Unregister an action
```

### 5.2 Downloads API

```lua
-- Read
dlman.downloads.get(id)                   -- Get download by ID
dlman.downloads.get_all()                 -- List all downloads
dlman.downloads.get_by_status(status)     -- Filter by status
dlman.downloads.get_by_queue(queue_id)    -- Filter by queue

-- Write
dlman.downloads.add(url, options)         -- Add a new download
dlman.downloads.pause(id)                 -- Pause
dlman.downloads.resume(id)               -- Resume
dlman.downloads.cancel(id)               -- Cancel
dlman.downloads.delete(id, delete_file)  -- Delete
dlman.downloads.retry(id)               -- Retry failed download
dlman.downloads.set_speed_limit(id, bps) -- Set speed limit
```

### 5.3 Queues API

```lua
dlman.queues.get_all()                    -- List queues
dlman.queues.get(id)                      -- Get queue by ID
dlman.queues.create(name, options)        -- Create queue
dlman.queues.update(id, options)          -- Update queue
dlman.queues.delete(id)                   -- Delete queue
dlman.queues.start(id)                    -- Start queue
dlman.queues.stop(id)                     -- Stop queue
```

### 5.4 Credentials API

```lua
dlman.credentials.get_all()               -- List saved credentials
dlman.credentials.get_for_domain(domain)  -- Find matching credentials
dlman.credentials.save(credential)        -- Save/update credential
dlman.credentials.delete(id)              -- Delete credential
```

### 5.5 HTTP Client (Sandboxed)

Plugins need to make HTTP requests (e.g., to resolve indirect URLs). We expose a controlled HTTP client:

```lua
-- GET request
local response = dlman.http.get(url, {
    headers = { ["Authorization"] = "Bearer xxx" },
    timeout = 30,
    follow_redirects = true,
})
-- response.status, response.headers, response.body, response.json

-- POST request
local response = dlman.http.post(url, {
    body = "key=value",
    json = { username = "user", password = "pass" },
    headers = {},
})

-- HEAD request (for probing)
local response = dlman.http.head(url, { headers = {} })
```

**Security**: The HTTP client respects plugin permissions. A plugin must declare `network` permission in its manifest to use `dlman.http`.

### 5.6 Storage API (Per-Plugin)

Each plugin gets its own sandboxed key-value storage (backed by SQLite):

```lua
dlman.storage.get(key)                    -- Get value
dlman.storage.set(key, value)             -- Set value (strings, numbers, tables)
dlman.storage.delete(key)                 -- Delete key
dlman.storage.get_all()                   -- Get all key-value pairs
```

Storage is namespaced per-plugin automatically. Plugin A cannot read Plugin B's storage.

### 5.7 Settings API

```lua
dlman.settings.get()                      -- Get current app settings
dlman.settings.get_value(key)             -- Get specific setting

-- Plugins can register their own settings (shown in Settings UI)
dlman.settings.register({
    key = "rapidgator_api_key",
    label = "Rapidgator API Key",
    type = "password",               -- "string" | "number" | "boolean" | "password" | "select"
    default = "",
    description = "Your Rapidgator API key for premium downloads",
})
dlman.settings.get_plugin_setting(key)
dlman.settings.set_plugin_setting(key, value)
```

### 5.8 Events API

```lua
-- Listen to core events
dlman.events.on("download-progress", function(data)
    -- React to progress updates
end)

dlman.events.on("download-status", function(data)
    -- React to status changes
end)

-- Emit custom events (other plugins + frontend can listen)
dlman.events.emit("my-plugin:video-resolved", {
    original_url = "...",
    video_url = "...",
    quality = "1080p",
})
```

### 5.9 Logging API

```lua
dlman.log.debug("Detailed info")
dlman.log.info("Something happened")
dlman.log.warn("Something might be wrong")
dlman.log.error("Something failed")

-- Logs appear in the Dev Console with plugin name prefix:
-- [rapidgator-auth] Something happened
```

### 5.10 UI Bridge API

```lua
-- Send data to the frontend plugin component
dlman.ui.send("my-panel", { videos = video_list })

-- Register a context menu item
dlman.ui.add_context_menu_item({
    id = "copy-direct-link",
    label = "Copy Direct Link",
    icon = "link",
    when = function(download) return download.status == "completed" end,
    action = function(download)
        dlman.clipboard.write(download.final_url or download.url)
        dlman.notify("Link Copied", download.final_url or download.url)
    end,
})

-- Register a toolbar button
dlman.ui.add_toolbar_button({
    id = "video-grabber",
    label = "Video Grabber",
    icon = "video",
    action = function()
        dlman.ui.open_panel("video-grabber-panel")
    end,
})
```

### 5.11 Utility APIs

```lua
dlman.clipboard.write(text)               -- Copy to clipboard
dlman.clipboard.read()                    -- Read from clipboard
dlman.notify(title, body)                 -- System notification
dlman.shell.open(path)                    -- Open file/folder in OS
dlman.fs.read(path)                       -- Read file (sandboxed to plugin dir)
dlman.fs.write(path, content)             -- Write file (sandboxed)
dlman.fs.exists(path)                     -- Check file exists
dlman.json.encode(table)                  -- JSON encode
dlman.json.decode(string)                 -- JSON decode
dlman.crypto.md5(string)                  -- MD5 hash
dlman.crypto.sha256(string)               -- SHA-256 hash
dlman.crypto.base64_encode(string)        -- Base64 encode
dlman.crypto.base64_decode(string)        -- Base64 decode
```

---

## 6. UI Extension System

### The Challenge

This is the hardest part. Backend plugins (Lua) are straightforward — the Rust side controls everything. UI plugins mean **third-party code rendering inside our React app**. 

### Approach: Plugin Slots + Declarative UI

We don't give plugins full DOM access (security nightmare). Instead, we define **slots** in our UI where plugins can inject content.

### 6.1 Plugin Slots (Extension Points in the UI)

```
┌────────────────────────────────────────────────────────────┐
│  Menu Bar [SLOT: toolbar-buttons]                          │
├────────────┬───────────────────────────────────────────────┤
│            │  Filter Bar [SLOT: filter-bar-extras]         │
│   Sidebar  ├───────────────────────────────────────────────┤
│            │                                               │
│ [SLOT:     │  Download List                                │
│  sidebar-  │  [SLOT: download-row-extras]                  │
│  sections] │  [SLOT: download-context-menu]                │
│            │                                               │
│            ├───────────────────────────────────────────────┤
│            │  [SLOT: bottom-panels]                        │
│            │  (Video grabber, logs, plugin panels)         │
├────────────┴───────────────────────────────────────────────┤
│  Status Bar [SLOT: status-bar-items]                       │
└────────────────────────────────────────────────────────────┘

Dialogs:
  [SLOT: new-download-dialog-extras]     — Extra fields/sections in new download
  [SLOT: settings-tabs]                  — Extra settings tabs
  [SLOT: custom-dialogs]                 — Plugin-defined dialogs
```

### 6.2 How UI Plugins Work

**Option A: Declarative UI (Recommended for Phase 1)**

Plugins describe their UI using a JSON-like schema. The app renders it using our existing shadcn/ui components:

```lua
-- Backend plugin declares a settings panel
dlman.ui.register_settings_tab({
    id = "rapidgator-settings",
    label = "Rapidgator",
    icon = "globe",
    fields = {
        { type = "text", key = "api_key", label = "API Key", placeholder = "Enter your API key" },
        { type = "switch", key = "preemptive_auth", label = "Send auth preemptively", default = true },
        { type = "select", key = "server", label = "Preferred Server", 
          options = { { value = "auto", label = "Auto" }, { value = "eu", label = "Europe" } } },
    }
})

-- Declare a sidebar section
dlman.ui.register_sidebar_section({
    id = "video-downloads",
    label = "Video Downloads",
    icon = "video",
    badge_count = function() return #pending_videos end,
})

-- Declare a bottom panel
dlman.ui.register_panel({
    id = "video-grabber-panel",
    label = "Video Grabber",
    icon = "video",
    layout = {
        { type = "input", key = "video_url", label = "Video URL", placeholder = "Paste video URL..." },
        { type = "button", key = "analyze", label = "Analyze", action = "analyze_video" },
        { type = "list", key = "formats", label = "Available Formats", 
          columns = { "Quality", "Format", "Size" },
          row_action = "download_format" },
    }
})
```

The React frontend has a `<PluginSlot name="settings-tabs" />` component that renders these declarations using our existing component library. Zero custom JS from plugins.

**Option B: React Components (Phase 2 — Advanced)**

For plugins that need more complex UIs, they can ship a small React component bundle:

```
plugins/
  video-grabber/
    init.lua              -- Backend logic
    manifest.json         -- Plugin metadata
    ui/
      panel.tsx           -- React component
      styles.css          -- Scoped styles
```

The `panel.tsx` would be compiled and loaded as a dynamic module:

```tsx
// plugins/video-grabber/ui/panel.tsx
import { usePluginStore } from "@dlman/plugin-sdk";

export default function VideoGrabberPanel() {
    const { data, send } = usePluginStore("video-grabber");
    
    return (
        <div className="p-4">
            <input 
                value={data.url} 
                onChange={(e) => send("set_url", e.target.value)}
                placeholder="Paste video URL..."
            />
            <button onClick={() => send("analyze")}>Analyze</button>
            {data.formats?.map(f => (
                <div key={f.id}>{f.quality} — {f.size}</div>
            ))}
        </div>
    );
}
```

**Security**: React plugin components run in a sandboxed iframe or shadow DOM. They can only communicate with the app through `usePluginStore` — no direct access to Zustand stores or Tauri APIs.

### 6.3 Plugin-to-Frontend Communication

```
┌──────────────────────────────┐
│  Lua Plugin (Backend)        │
│                              │
│  dlman.ui.send("panel", {})  │──── Tauri event: "plugin:video-grabber:data" ────►
│                              │
└──────────────────────────────┘
                                    ┌──────────────────────────────┐
                                    │  React Frontend              │
                                ◄───│                              │
  Tauri invoke: "plugin_action" ────│  usePluginStore("video...")  │
                                    │  onClick → send("analyze")  │
                                    └──────────────────────────────┘
```

---

## 7. Plugin Lifecycle & Management

### 7.1 Plugin Directory Structure

```
~/.dlman/
  plugins/
    rapidgator-auth/
      manifest.json         -- Plugin metadata & permissions
      init.lua              -- Entry point (required)
      lib/                  -- Additional Lua modules
        api.lua
        parser.lua
      ui/                   -- Optional frontend components (Phase 2)
        panel.tsx
      assets/               -- Icons, images
        icon.png
      storage/              -- Auto-created, plugin's private data
    
    video-grabber/
      manifest.json
      init.lua
      lib/
        youtube.lua
        vimeo.lua
        extractors/
          generic.lua
      ui/
        panel.tsx
        format-picker.tsx
```

### 7.2 Plugin Manifest

```json
{
    "id": "rapidgator-auth",
    "name": "Rapidgator Premium Auth",
    "version": "1.0.0",
    "description": "Automatically resolve premium download links from Rapidgator",
    "author": "community",
    "homepage": "https://github.com/someone/dlman-rapidgator",
    "license": "MIT",
    
    "dlman_version": ">=2.0.0",
    "dependencies": [],
    
    "permissions": [
        "network",
        "credentials:read",
        "credentials:write",
        "downloads:read",
        "downloads:write",
        "storage",
        "notifications",
        "ui:context-menu",
        "ui:settings-tab"
    ],
    
    "domains": ["rapidgator.net", "rg.to"],
    
    "entry": "init.lua",
    
    "settings": [
        {
            "key": "api_key",
            "label": "API Key",
            "type": "password",
            "required": true
        }
    ],
    
    "ui": {
        "settings_tab": true,
        "context_menu_items": true,
        "panels": ["download-resolver"]
    }
}
```

### 7.3 Plugin Lifecycle

```
App Start
    │
    ├── Scan ~/.dlman/plugins/ for manifest.json files
    │
    ├── For each plugin:
    │   ├── Read manifest.json
    │   ├── Check dlman_version compatibility
    │   ├── Check if enabled in settings DB
    │   ├── Check dependencies satisfied
    │   ├── Create sandboxed Lua VM (mlua::Lua)
    │   ├── Inject dlman API module (filtered by permissions)
    │   ├── Execute init.lua
    │   │     └── Plugin registers hooks, UI elements, etc.
    │   ├── Call plugin:on_load() if defined
    │   └── Mark plugin as "active"
    │
    ├── Sort all registered hooks by priority
    │
    └── Emit "plugins-loaded" event to frontend
         └── Frontend renders plugin UI elements

Plugin Disable (at runtime)
    │
    ├── Call plugin:on_unload() if defined
    ├── Remove all hooks registered by this plugin
    ├── Remove UI elements registered by this plugin
    ├── Drop Lua VM (frees memory)
    └── Mark as "disabled" in settings DB

Plugin Enable (at runtime)
    │
    └── Same as startup flow for this single plugin

Hot Reload (dev mode only)
    │
    ├── Watch plugin directory for file changes
    ├── On change: disable → re-enable
    └── Emit "plugin-reloaded" event
```

### 7.4 New Rust Crate: `dlman-plugins`

```
crates/
  dlman-plugins/
    Cargo.toml
    src/
      lib.rs               -- PluginManager public API
      loader.rs            -- Scan directory, load manifests
      sandbox.rs           -- Create sandboxed Lua VMs
      api/
        mod.rs             -- dlman Lua module definition
        downloads.rs       -- dlman.downloads.* functions
        queues.rs          -- dlman.queues.* functions
        credentials.rs     -- dlman.credentials.* functions
        http.rs            -- dlman.http.* functions
        storage.rs         -- dlman.storage.* functions
        events.rs          -- dlman.events.* functions
        ui.rs              -- dlman.ui.* functions
        settings.rs        -- dlman.settings.* functions
        utils.rs           -- dlman.log, json, crypto, etc.
      hooks.rs             -- HookRegistry (filter + action chains)
      manifest.rs          -- Manifest parsing & validation
      permissions.rs       -- Permission checking
```

### 7.5 Integration with Existing Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  DlmanCore (existing)                                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  pub plugin_manager: Arc<PluginManager>   ← NEW FIELD    │  │
│  │                                                           │  │
│  │  Before add_download():                                   │  │
│  │    url = plugin_manager.apply_filter("on_url_added", url) │  │
│  │                                                           │  │
│  │  Before probe:                                            │  │
│  │    data = plugin_manager.apply_filter("on_url_resolve",..)│  │
│  │                                                           │  │
│  │  On 401:                                                  │  │
│  │    creds = plugin_manager.apply_filter("on_auth_required")│  │
│  │                                                           │  │
│  │  After complete:                                          │  │
│  │    plugin_manager.run_action("on_download_complete", ..)  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Everything else stays the same. Plugins are additive.          │
└────────────────────────────────────────────────────────────────┘
```

---

## 8. Implementation Plan & Phases

### Phase 1: Foundation (3-4 weeks)
**Goal: Plugins can run Lua scripts and hook into download pipeline**

- [ ] Create `dlman-plugins` crate
- [ ] Add `mlua` dependency with Lua 5.4 feature
- [ ] Implement `PluginManager` — load/unload/list plugins
- [ ] Implement `manifest.json` parser
- [ ] Implement `HookRegistry` — filter chains + action dispatch
- [ ] Implement sandboxed Lua VM creation (remove dangerous builtins)
- [ ] Implement `dlman` Lua module with: `add_filter`, `add_action`, `log.*`
- [ ] Integrate `PluginManager` into `DlmanCore`
- [ ] Add hook calls at 4 critical points:
  - `on_url_added` (in `add_download`)
  - `on_url_resolve` (in `download_task::probe`)
  - `on_request_build` (in `segment_worker`)
  - `on_download_complete` (in `download_task`)
- [ ] Add Tauri commands: `get_plugins`, `enable_plugin`, `disable_plugin`
- [ ] Basic "Plugins" tab in Settings (list, enable/disable)
- [ ] Write a sample plugin: `hello-world` (logs on every download)

**Estimated difficulty: 6/10**

### Phase 2: API Expansion (2-3 weeks)
**Goal: Plugins can do useful things — HTTP requests, credentials, storage**

- [ ] Implement `dlman.http.*` (GET, POST, HEAD via reqwest)
- [ ] Implement `dlman.downloads.*` (read/write via DlmanCore methods)
- [ ] Implement `dlman.queues.*`
- [ ] Implement `dlman.credentials.*`
- [ ] Implement `dlman.storage.*` (per-plugin SQLite table)
- [ ] Implement `dlman.events.*` (subscribe to CoreEvents)
- [ ] Implement `dlman.settings.register()` for plugin-defined settings
- [ ] Add all remaining hooks from Section 4
- [ ] Permission enforcement (check manifest before allowing API calls)
- [ ] Write sample plugin: `rapidgator-auth` (the user's actual use case)
- [ ] Write sample plugin: `copy-direct-link` (context menu item)

**Estimated difficulty: 5/10**

### Phase 3: Declarative UI (2-3 weeks)
**Goal: Plugins can add UI elements without writing React code**

- [ ] Implement `PluginSlot` React component
- [ ] Implement declarative UI schema renderer (settings tabs, panels, context menus)
- [ ] Implement `usePluginStore` hook for plugin data
- [ ] Add plugin slots to: Settings, Sidebar, Toolbar, Context Menu, Status Bar
- [ ] Plugin-registered settings show in Settings UI
- [ ] Plugin-registered context menu items show in download right-click
- [ ] Tauri event bridge for `dlman.ui.send()` → frontend
- [ ] Frontend → backend action bridge for UI interactions
- [ ] Write sample plugin: `video-grabber` with bottom panel

**Estimated difficulty: 7/10**

### Phase 4: Advanced UI + Polish (2-3 weeks)
**Goal: Plugins can ship React components, hot-reload works**

- [ ] Dynamic ESM loading for plugin React components
- [ ] Shadow DOM isolation for plugin UI components
- [ ] `@dlman/plugin-sdk` npm package for TypeScript plugin dev
- [ ] Hot-reload watcher in dev mode
- [ ] Plugin error boundaries (crash one plugin, others keep working)
- [ ] Plugin update mechanism (check git repos for new versions)
- [ ] Plugin template generator (`dlman create-plugin my-plugin`)
- [ ] Documentation site for plugin developers

**Estimated difficulty: 8/10**

### Phase 5: Marketplace (Future)
**Goal: Users discover and install plugins from a central registry**

- [ ] Plugin registry API (GitHub-based or self-hosted)
- [ ] "Browse Plugins" UI in the app
- [ ] One-click install/update/uninstall
- [ ] Plugin ratings and reviews
- [ ] Consider WASM sandboxing for untrusted plugins
- [ ] Plugin signing and verification

**Estimated difficulty: 9/10**

---

## 9. Difficulty Assessment & Risks

### Overall Difficulty: 7/10 — Hard but absolutely doable

This is not "impossible." It's a well-understood problem with proven patterns. The hard parts are specific and contained.

### What Makes It Hard

| Challenge | Difficulty | Why | Mitigation |
|-----------|-----------|-----|------------|
| Async Lua ↔ Rust bridge | 8/10 | Lua is synchronous, our core is async (Tokio). Need to bridge `async fn` calls into Lua coroutines | `mlua` has `AsyncThread` support. Wrap async calls in `scope.spawn_local()` |
| Filter chain correctness | 6/10 | Plugin A modifies data, Plugin B sees modified data. Order matters, errors in one shouldn't break the chain | Priority system + try/catch per handler + original data fallback |
| UI slot system | 7/10 | Dynamic React component injection, state sync between Lua and React | Start with declarative UI (JSON schema), add React components later |
| Plugin isolation | 6/10 | One plugin shouldn't crash another or the app | Separate Lua VMs per plugin, error boundaries, timeouts |
| API stability | 5/10 | Once plugins exist, we can't easily change the API | Version the API, deprecate gracefully |
| Performance overhead | 4/10 | Filter chains on hot paths (every chunk?) add latency | Don't hook into `on_chunk_received` by default, make it opt-in |

### What Makes It Doable

1. **Our architecture is already modular** — `DlmanCore` is a clean facade with clear public methods. Adding plugin hooks is surgical, not architectural
2. **The event system exists** — `CoreEvent` broadcast channel is already pub/sub. Plugins just become another subscriber
3. **`mlua` is mature** — Production-quality crate, used by Neovim. Well-documented, handles edge cases
4. **We can be incremental** — Phase 1 alone (basic hooks) solves 80% of the user's request. We don't need the full marketplace to be useful
5. **Blender/WordPress proved the model** — We're not inventing anything new, just applying proven patterns

### Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Plugin crashes take down the app | High | Medium | Lua VM per plugin + `pcall` wrapping + timeouts |
| Plugin API becomes a maintenance burden | Medium | High | Minimize API surface, version it, semver |
| Nobody writes plugins | Medium | Medium | Ship 3-5 first-party plugins as examples |
| Performance regression on hot paths | Medium | Low | Only hook hot paths when plugin explicitly opts in |
| Security — malicious plugins | High | Low (no marketplace yet) | Sandboxed Lua, permission system, no raw FFI |
| `mlua` crate becomes unmaintained | Medium | Very Low | Mature crate with active maintainer, fallback to `rlua` |

### Binary Size Impact

| Addition | Size Estimate |
|----------|--------------|
| Lua 5.4 interpreter (via `mlua`) | ~300KB |
| Plugin manager code | ~50KB |
| API bindings | ~100KB |
| **Total** | **~450KB** |

Compare: current binary is ~15MB. Plugin system adds ~3% — negligible.

---

## 10. Comparisons: Blender, WordPress, VS Code

### How Blender Does It

| Aspect | Blender | DLMan Equivalent |
|--------|---------|-----------------|
| Language | Python | Lua |
| Embedding | `bpy` module compiled into Blender binary | `dlman` Lua module injected by `mlua` |
| Hooks | Handlers, operators, panels registered via decorators | `dlman.add_filter()` / `dlman.add_action()` |
| UI | `bpy.types.Panel`, `bpy.types.Operator` | `dlman.ui.register_panel()`, declarative schema |
| Distribution | `.py` files or `.zip` addons | Plugin folders with `manifest.json` + `init.lua` |
| Enable/Disable | Preferences → Add-ons | Settings → Plugins |
| Marketplace | Blender Market (third-party) | Future: built-in or GitHub-based |
| Sandbox | None (full Python access) | Sandboxed Lua (no `os.execute`, limited `io`) |

### How WordPress Does It

| Aspect | WordPress | DLMan Equivalent |
|--------|-----------|-----------------|
| Language | PHP | Lua |
| Hooks | `add_action()` / `add_filter()` | Identical concept |
| Priority | Integer (default 10) | Integer (default 10) |
| UI Extension | `add_menu_page()`, `add_meta_box()` | `dlman.ui.register_panel()`, slots |
| Settings | Settings API with `register_setting()` | `dlman.settings.register()` |
| Storage | `$wpdb`, `get_option()` | `dlman.storage.*` (per-plugin SQLite) |
| HTTP | `wp_remote_get()` | `dlman.http.get()` |
| Activation | `register_activation_hook()` | `on_load()` function in `init.lua` |

### How VS Code Does It

| Aspect | VS Code | DLMan Equivalent |
|--------|---------|-----------------|
| Language | JavaScript/TypeScript | Lua (backend), JS/TS (UI) |
| Manifest | `package.json` with contribution points | `manifest.json` with permissions |
| Activation | `activationEvents` — lazy loading | Load on app start (simpler) |
| API | `vscode.*` namespace | `dlman.*` namespace |
| UI | Webview panels, TreeView, StatusBar | Plugin slots, declarative panels |
| Marketplace | Built-in marketplace | Future phase |
| Sandbox | Separate extension host process | Separate Lua VM per plugin |

### Key Takeaway

We're closest to the **WordPress model** (simple hooks/filters) with **Blender's runtime embedding** (scripting language compiled into the app) and **VS Code's manifest system** (declared permissions and contribution points).

This combination is **proven, well-understood, and implementable**.

---

## Example: Solving the User's Rapidgator Request

With the plugin system, the user's request becomes a community plugin:

```
plugins/rapidgator-auth/
  manifest.json
  init.lua
```

```lua
-- init.lua
local dlman = require("dlman")

local DOMAINS = { "rapidgator.net", "rg.to" }

-- Check if this URL is for our domains
local function is_our_domain(domain)
    for _, d in ipairs(DOMAINS) do
        if string.find(domain, d) then return true end
    end
    return false
end

-- Hook: Resolve indirect URLs to direct download links
dlman.add_filter("on_url_resolve", 10, function(data)
    if not is_our_domain(data.domain) then return data end
    
    local settings = dlman.settings.get_plugin_setting
    local api_key = settings("api_key")
    if not api_key or api_key == "" then
        dlman.log.warn("No API key configured for Rapidgator")
        return data
    end
    
    -- Call Rapidgator API to resolve download link
    local resp = dlman.http.get(
        "https://rapidgator.net/api/v2/file/download"
        .. "?token=" .. api_key 
        .. "&url=" .. dlman.url_encode(data.url)
    )
    
    if resp.status == 200 and resp.json and resp.json.response then
        data.url = resp.json.response.download_url
        data.resolved = true
        dlman.log.info("Resolved Rapidgator link: " .. data.url)
    else
        dlman.log.error("Failed to resolve: " .. (resp.json and resp.json.error or "unknown"))
    end
    
    return data
end)

-- Hook: Add preemptive auth header for our domains
dlman.add_filter("on_request_build", 10, function(data)
    if not is_our_domain(data.domain) then return data end
    
    local creds = dlman.credentials.get_for_domain(data.domain)
    if creds then
        -- Preemptive auth — send WITHOUT waiting for 401
        data.headers["Authorization"] = "Basic " 
            .. dlman.crypto.base64_encode(creds.username .. ":" .. creds.password)
    end
    
    return data
end)

-- Context menu: Copy direct link
dlman.ui.add_context_menu_item({
    id = "rg-copy-direct-link",
    label = "Copy Direct Link (Rapidgator)",
    icon = "link",
    when = function(download)
        return is_our_domain(download.domain) and download.final_url ~= nil
    end,
    action = function(download)
        dlman.clipboard.write(download.final_url)
        dlman.notify("Direct Link Copied", download.final_url)
    end,
})

dlman.log.info("Rapidgator Auth plugin loaded")
```

**This is exactly what the user asked for** — and it lives outside the core app, maintained by whoever needs it.

---

## Summary: Can We Do This?

| Question | Answer |
|----------|--------|
| Is it possible? | **Yes, absolutely.** Every technology we need exists and is proven. |
| Is it hard? | **Medium-hard (7/10).** The async Lua↔Rust bridge and UI slots are the trickiest parts. |
| How long for Phase 1 (useful)? | **3-4 weeks** of focused work. |
| How long for the full vision? | **3-4 months** across all phases. |
| Will it break existing code? | **No.** Plugins are additive — hook calls are no-ops when no plugins are loaded. |
| Binary size impact? | **~450KB** (~3% increase). Negligible. |
| Can plugins manipulate UI? | **Yes** — declarative UI first (Phase 3), React components later (Phase 4). |
| What language? | **Lua** for backend logic, **JavaScript/React** for UI components. |
| What about the Rapidgator user? | **Solved by a ~60-line Lua plugin.** |