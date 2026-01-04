# DLMan Browser Extension

Download the DLMan browser extension to capture downloads directly from your browser and send them to DLMan for faster, more reliable downloading.

## Download

Click the links below to download the latest pre-built extension for your browser:

### Chrome / Edge / Brave (Chromium-based)

📦 **[dlman-extension-chrome.zip](https://github.com/novincode/dlman/releases/latest/download/dlman-extension-chrome.zip)**

**Installation:**
1. Download and extract the ZIP file
2. Open your browser and go to `chrome://extensions` (or `edge://extensions` for Edge)
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the extracted folder
6. Done! The extension icon will appear in your toolbar

### Firefox

📦 **[dlman-extension-firefox.zip](https://github.com/novincode/dlman/releases/latest/download/dlman-extension-firefox.zip)**

**Installation:**
1. Download the ZIP file
2. Extract it somewhere
3. Open Firefox and go to `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on**
5. Select any file from the extracted folder
6. Done! The extension icon will appear in your toolbar

> **Note:** Firefox temporary add-ons are removed when Firefox is closed. For permanent installation, the extension would need to be signed by Mozilla.

## Features

- 🔗 **Automatic Download Interception** - Automatically catches downloads and sends them to DLMan
- 🖱️ **Right-Click Context Menu** - Right-click any link to download with DLMan
- 📋 **Batch Downloads** - Download multiple files at once
- ⚙️ **Per-Site Settings** - Disable DLMan on specific websites
- 📊 **Real-time Status** - See connection status and active downloads

## Requirements

- DLMan desktop app must be running
- Default integration port: `7899` (configurable in DLMan Settings → Extensions)

## Troubleshooting

### Extension not connecting to DLMan?

1. Make sure DLMan desktop app is running
2. Check the connection port in DLMan Settings → Extensions
3. Look for the extension icon - a red badge (!) means connection failed
4. Click the extension icon to see detailed connection status

### Downloads not being intercepted?

1. Click the extension icon and verify it shows "Connected"
2. Check that "Auto-intercept downloads" is enabled
3. Verify the file type matches your intercept patterns
4. Make sure the website isn't in your disabled sites list

## Building from Source

If you want to build the extensions yourself:

```bash
# Clone the repository
git clone https://github.com/novincode/dlman.git
cd dlman

# Install dependencies
pnpm install

# Build Chrome extension
pnpm --filter @dlman/extension build:chrome

# Build Firefox extension
pnpm --filter @dlman/extension build:firefox
```

The built extensions will be in `apps/extension/dist/`.

## Source Code

The extension source code is available at: [apps/extension](https://github.com/novincode/dlman/tree/main/apps/extension)

---

**Latest Release:** See all downloads and releases on [GitHub Releases](https://github.com/novincode/dlman/releases)
