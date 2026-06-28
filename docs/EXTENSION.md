# Browser Extension

The DLMan browser extension provides seamless integration between your web browser and the DLMan desktop application. It allows you to capture downloads from your browser and send them to DLMan for faster, more reliable downloading.

## Features

- **Automatic Download Interception**: Automatically intercepts browser downloads and sends them to DLMan
- **Context Menu Integration**: Right-click on any link to download it with DLMan
- **Batch Downloads**: Download all links on a page at once
- **Video Detection & Download**: IDM-style overlay button on detected videos with quality selection
- **HLS/DASH Support**: Detects and downloads streaming video (m3u8, mpd)
- **Per-Site Settings**: Disable DLMan on specific websites
- **Real-time Status**: Shows connection status and active downloads in the popup

## Architecture

### Communication Flow

```
Browser Extension  <-->  Desktop App (Browser Server)  <-->  DLMan Core
     |                          |
     |   HTTP/WebSocket         |
     |   (localhost:7899)       |
     |                          |
     v                          v
  Content Script           Window Manager
     |                          |
     v                          v
  Background Script       New Download Dialog
```

### Components

1. **Background Script** (`src/entrypoints/background.ts`)
   - Manages extension lifecycle
   - Handles download interception
   - Communicates with the desktop app
   - Sets up context menus

2. **Content Script** (`src/entrypoints/content.ts`)
   - Runs on web pages
   - Detects downloadable links
   - **Video Detection**: Observes DOM + network for media streams
   - **Video Overlay**: Shows IDM-style download button on detected videos
   - Handles deep link opening for dialogs
   - Collects page information

3. **Popup** (`src/entrypoints/popup/`)
   - Shows extension status
   - Displays active downloads
   - Allows quick configuration

4. **API Client** (`src/lib/api-client.ts`)
   - WebSocket and HTTP client for desktop app communication
   - Handles request/response matching
   - Manages connection lifecycle
   - Media download requests (`POST /api/media/download`)

5. **Video Detector** (`src/lib/video-detector.ts`)
   - DOM Observer: Watches `<video>`, `<source>`, `<audio>` elements
   - Network Intercept: Hooks XHR/fetch for `.m3u8`/`.mpd`/`.mp4` URLs
   - Event Listeners: Captures `loadedmetadata`/`canplay` events
   - Deduplication and classification by protocol

6. **Video Overlay** (`src/lib/video-overlay.ts`)
   - Sticky floating download button (IDM-style) on detected videos
   - Quality picker dropdown for multi-variant streams
   - Scoped styles to avoid CSS conflicts with page
   - Repositions on scroll/resize

7. **HLS Parser** (`src/lib/hls-parser.ts`)
   - Lightweight m3u8 master playlist parser
   - Extracts quality variants for the quality picker UI
   - Runs in content script (no server roundtrip for variant listing)

### Video Detection Flow

```
Page loads
    │
    ├── VideoDetector starts
    │   ├── Scans existing <video> elements
    │   ├── Observes DOM mutations (new elements)
    │   ├── Hooks XHR/fetch (network sniffing)
    │   └── Listens for loadedmetadata events
    │
    ├── Media URL detected (.mp4, .m3u8, .mpd)
    │   ├── Classified by protocol (direct/hls/dash)
    │   ├── Deduplicated by base URL
    │   └── For HLS: master playlist fetched & parsed
    │
    ├── VideoOverlayManager
    │   ├── Finds the associated <video> element
    │   ├── Creates floating download button
    │   ├── If multi-quality: shows dropdown picker
    │   └── Positioned top-right of video element
    │
    └── User clicks download
        ├── Content script → background (media-download message)
        ├── Background → desktop app (POST /api/media/download)
        └── Desktop app opens download/media dialog
```

### Desktop App Integration

The extension communicates with the desktop app through a local HTTP/WebSocket server running on `localhost:7899` (configurable).

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ping` | Health check |
| GET | `/api/status` | Get app status |
| GET | `/api/queues` | List download queues |
| GET | `/api/downloads` | List all downloads |
| POST | `/api/downloads` | Add a new download |
| POST | `/api/show-dialog` | Request to show the new download dialog |
| POST | `/api/media/download` | Download a detected media stream (direct/HLS/DASH) |
| POST | `/api/downloads/:id/pause` | Pause a download |
| POST | `/api/downloads/:id/resume` | Resume a download |
| POST | `/api/downloads/:id/cancel` | Cancel a download |
| WS | `/ws` | WebSocket for real-time updates |

#### Show Dialog Flow

When the extension intercepts a download, it:

1. Sends a request to `/api/show-dialog` with the URL
2. Receives a deep link URL (`dlman://add-download?url=...`)
3. Opens the deep link via the content script
4. The desktop app receives the deep link and opens the New Download dialog
5. User can configure the download (destination, queue, etc.)
6. User clicks "Start Download" or "Download Later"

This flow ensures the user always has control over:
- Where to save the file
- Which queue to use
- Whether to start immediately or queue for later

### Deep Links

DLMan supports deep links for integration:

- `dlman://add-download?url=<encoded-url>` - Opens the new download dialog with the specified URL

## Installation

### Chrome/Edge (Chromium-based)

1. Build the extension: `pnpm ext:build`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `apps/extension/.output/chrome-mv3` directory

### Firefox

1. Build the extension: `pnpm ext:build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select any file in `apps/extension/.output/firefox-mv2`

## Development

### Setup

```bash
# Install dependencies
pnpm install

# Start development mode (Chrome)
pnpm ext:dev

# Start development mode (Firefox)
pnpm ext:dev:firefox
```

### Building

```bash
# Build for Chrome
pnpm ext:build

# Build for Firefox
pnpm ext:build:firefox
```

### Project Structure

```
apps/extension/
├── src/
│   ├── entrypoints/
│   │   ├── background.ts      # Background service worker
│   │   ├── content.ts         # Content script + video detection init
│   │   ├── options/           # Options page
│   │   └── popup/             # Extension popup
│   ├── lib/
│   │   ├── api-client.ts      # Desktop app communication
│   │   ├── hls-parser.ts      # Lightweight HLS manifest parser
│   │   ├── media-types.ts     # Media detection TypeScript types
│   │   ├── storage.ts         # Extension storage helpers
│   │   ├── utils.ts           # Utility functions
│   │   ├── video-detector.ts  # DOM + network media detection engine
│   │   └── video-overlay.ts   # IDM-style overlay UI on videos
│   ├── styles/
│   │   └── globals.css        # Global styles
│   └── types/
│       └── index.ts           # TypeScript types
├── public/
│   └── icon/                  # Extension icons
├── wxt.config.ts              # WXT configuration
├── tailwind.config.js         # Tailwind CSS configuration
└── package.json
```

## Configuration

### Extension Settings

Access extension settings through the popup or options page:

- **Enable/Disable**: Toggle download interception
- **Port**: Desktop app port (default: 7899)
- **Auto-intercept**: Automatically intercept browser downloads
- **Fallback to browser**: Use browser downloads when DLMan is not running
- **Show notifications**: Display notifications for download events
- **Intercept patterns**: File patterns to intercept (e.g., `.zip`, `.exe`)

### Per-Site Settings

Right-click on a page and select "Disable DLMan on this site" to prevent interception for specific websites.

## Troubleshooting

### Extension Not Connecting

1. Ensure DLMan desktop app is running
2. Check that the port matches (default: 7899)
3. Look for error badge ("!") on the extension icon
4. Check browser console for connection errors

### Downloads Not Being Intercepted

1. Verify "Auto-intercept" is enabled
2. Check that the file type matches intercept patterns
3. Ensure the site is not in the disabled list
4. Verify the download URL is accessible

### Deep Links Not Working

1. Ensure the DLMan app is registered as protocol handler
2. On macOS: Check System Settings > Default Apps
3. On Windows: Check Default Apps in Settings
4. Try restarting the desktop app

## Security

- The extension only communicates with `localhost`
- No data is sent to external servers
- All communication is local to your machine
- The browser server is bound to `127.0.0.1` only
