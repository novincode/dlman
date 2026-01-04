# DLMan Browser Extension

Modern browser extension for DLMan - the free, open-source download manager.

## Features

- 🚀 **Download Interception** - Automatically capture downloads and send to DLMan
- 🎯 **Context Menu** - Right-click to download any link with DLMan
- ⚡ **Real-time Updates** - See download progress in the popup
- 🔒 **Per-Site Control** - Enable/disable DLMan on specific sites
- 🎨 **Beautiful UI** - Modern design matching the DLMan desktop app
- 🌙 **Dark Mode** - System-aware theme support

## Installation

### Development

```bash
# From the root of the dlman monorepo
pnpm install

# Start development mode (Chrome)
pnpm --filter @dlman/extension dev

# Start development mode (Firefox)
pnpm --filter @dlman/extension dev:firefox
```

### Building

```bash
# Build for Chrome
pnpm --filter @dlman/extension build

# Build for Firefox
pnpm --filter @dlman/extension build:firefox

# Create distribution zip
pnpm --filter @dlman/extension zip
```

### Loading in Browser

#### Chrome / Edge / Brave
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `apps/extension/dist` folder

#### Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `apps/extension/dist`

## Architecture

```
extension/
├── src/
│   ├── entrypoints/
│   │   ├── background.ts      # Service worker
│   │   ├── content.ts         # Content script for link detection
│   │   ├── popup/             # Extension popup UI
│   │   │   ├── App.tsx
│   │   │   └── components/
│   │   └── options/           # Settings page
│   │       └── App.tsx
│   ├── lib/
│   │   ├── api-client.ts      # DLMan connection client
│   │   ├── storage.ts         # Extension storage wrapper
│   │   └── utils.ts           # Utility functions
│   ├── types/
│   │   └── index.ts           # TypeScript types
│   └── styles/
│       └── globals.css        # Tailwind CSS
├── public/
│   └── icon/                  # Extension icons
├── wxt.config.ts              # WXT configuration
└── package.json
```

## Communication with DLMan

The extension communicates with the DLMan desktop app via:

1. **WebSocket** (primary) - Real-time bidirectional communication on `ws://localhost:7899/ws`
2. **HTTP REST API** (fallback) - Request/response on `http://localhost:7899/api/*`

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ping` | GET | Health check |
| `/api/status` | GET | Get DLMan status |
| `/api/queues` | GET | List all queues |
| `/api/downloads` | GET | List all downloads |
| `/api/downloads` | POST | Add a new download |
| `/ws` | WS | WebSocket for real-time events |

### Add Download Request

```typescript
{
  url: string;
  filename?: string;
  destination?: string;
  queue_id?: string;
  referrer?: string;
  cookies?: string;
  headers?: Record<string, string>;
}
```

## Configuration

Settings are stored in browser extension storage and can be configured via the options page:

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable/disable the extension |
| `port` | `7899` | DLMan connection port |
| `autoIntercept` | `true` | Auto-capture matching downloads |
| `interceptPatterns` | Common file types | File patterns to intercept |
| `disabledSites` | `[]` | Sites where DLMan is disabled |
| `fallbackToBrowser` | `true` | Use browser when DLMan not running |
| `showNotifications` | `true` | Show download notifications |
| `theme` | `system` | Color theme (light/dark/system) |

## Browser Support

- ✅ Chrome/Chromium (Manifest V3)
- ✅ Firefox (Manifest V2/V3)
- ✅ Edge
- ✅ Brave
- 🔜 Safari (coming soon)

## Release & Distribution

### Monorepo Approach

The extension is part of the DLMan monorepo (`apps/extension`). This provides:
- **Shared types** with the desktop app
- **Consistent versioning** across all DLMan components
- **Single CI/CD pipeline** for building and releasing

### Automated Releases

When a new version is tagged (e.g., `v1.6.0`), GitHub Actions automatically:
1. Builds Chrome and Firefox extensions
2. Creates zip files for each browser
3. Uploads them to the GitHub release

### Browser Store Distribution

| Store | Status | Notes |
|-------|--------|-------|
| Chrome Web Store | 🔜 Planned | Submit `dlman-extension-chrome-*.zip` |
| Firefox Add-ons | 🔜 Planned | Submit `dlman-extension-firefox-*.zip` |
| Edge Add-ons | 🔜 Planned | Uses Chrome extension |

### Manual Installation

Download the latest extension zip from [GitHub Releases](https://github.com/novincode/dlman/releases) and load as an unpacked extension.

## Tech Stack

- **Framework**: [WXT](https://wxt.dev) - Next-gen Web Extension Framework
- **UI**: React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui patterns
- **State**: Zustand
- **Build**: Vite

## License

MIT - Same as the main DLMan project.
