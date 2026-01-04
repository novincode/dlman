# DLMan Browser Extension

Modern browser extension for DLMan - the free, open-source download manager.

## 📥 Quick Download

| Browser | Download |
|---------|----------|
| ![Chrome](https://img.shields.io/badge/Chrome-4285F4?logo=googlechrome&logoColor=white) | [Download for Chrome](https://github.com/novincode/dlman/releases/latest/download/dlman-extension-chrome-v1.6.0.zip) |
| ![Firefox](https://img.shields.io/badge/Firefox-FF7139?logo=firefox&logoColor=white) | [Download for Firefox](https://github.com/novincode/dlman/releases/latest/download/dlman-extension-firefox-v1.6.0.zip) |
| ![Edge](https://img.shields.io/badge/Edge-0078D7?logo=microsoftedge&logoColor=white) | Use Chrome version |
| ![Brave](https://img.shields.io/badge/Brave-FB542B?logo=brave&logoColor=white) | Use Chrome version |

> **Note:** You can always find the latest releases at [GitHub Releases](https://github.com/novincode/dlman/releases)

## ✨ Features

- 🚀 **Download Interception** - Automatically capture downloads and send to DLMan
- 🎯 **Context Menu** - Right-click on any link → "Download with DLMan"
- ⚡ **Real-time Updates** - See download progress in the popup
- 🔒 **Per-Site Control** - Enable/disable on specific sites
- 🌙 **Dark Mode** - System-aware theme support

## 🔧 Installation

### Chrome / Edge / Brave

1. Download the Chrome extension zip above
2. Extract the zip file
3. Go to `chrome://extensions`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked**
6. Select the extracted folder

### Firefox

1. Download the Firefox extension zip above
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select the zip file (or any file inside)

## 🔗 How It Works

The extension connects to the DLMan desktop app running on your computer.

**Make sure DLMan desktop app is running** before using the extension!

When you:
- Click on a download link, OR
- Right-click a link → "Download with DLMan"

The extension sends the URL to DLMan, which handles the download with:
- Multi-segment downloading
- Resume capability
- Queue management
- Speed limiting

## ⚙️ Settings

Click the extension icon → Settings to configure:

- **Auto-intercept** - Capture downloads automatically
- **File patterns** - Which file types to intercept
- **Disabled sites** - Sites where DLMan won't intercept

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Development mode
pnpm --filter @dlman/extension dev      # Chrome
pnpm --filter @dlman/extension dev:firefox  # Firefox

# Build
pnpm --filter @dlman/extension build    # Chrome
pnpm --filter @dlman/extension build:firefox  # Firefox
```

See [docs/EXTENSION.md](../../docs/EXTENSION.md) for detailed development documentation.

## 📜 License

MIT - Same as the main DLMan project.
