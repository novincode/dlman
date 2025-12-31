# DLMan Installation Guide

## Downloads

Get the latest version from the [Releases](https://github.com/YOUR_USERNAME/opendm/releases) page.

---

## Windows

### Installer (.msi)
1. Download `DLMan_x64_en-US.msi`
2. Double-click to run the installer
3. Follow the installation wizard
4. DLMan will be available in your Start menu

### Portable (.exe)
1. Download `DLMan_x64-setup.exe`
2. Run the executable
3. Choose installation location

---

## macOS

### Important: Unsigned App Warning

DLMan is not signed with an Apple Developer certificate. This means macOS will block it from running initially.

### Installation Steps

1. **Download** the appropriate `.dmg` file:
   - `DLMan_x64.dmg` for Intel Macs
   - `DLMan_aarch64.dmg` for Apple Silicon (M1/M2/M3) Macs

2. **Open** the DMG file and drag DLMan to Applications

3. **Remove quarantine attribute** (choose one method):

   **Method A: Terminal (Recommended)**
   ```bash
   xattr -cr /Applications/DLMan.app
   ```

   **Method B: Right-click**
   - Right-click on DLMan.app in Applications
   - Click "Open" from the context menu
   - Click "Open" again in the warning dialog

4. **Launch** DLMan normally from now on

### Quick Install Script

Save this as `install-dlman.sh` and run it:

```bash
#!/bin/bash
# DLMan macOS Installation Script

# Remove quarantine attribute
if [ -d "/Applications/DLMan.app" ]; then
    echo "Removing quarantine attribute from DLMan..."
    xattr -cr /Applications/DLMan.app
    echo "✅ Done! You can now open DLMan from Applications."
else
    echo "❌ DLMan.app not found in /Applications"
    echo "Please drag DLMan to Applications first, then run this script."
fi
```

---

## Linux

### Debian/Ubuntu (.deb)
```bash
# Download the .deb file, then:
sudo dpkg -i dlman_*_amd64.deb

# If there are dependency issues:
sudo apt-get install -f
```

### Fedora/RHEL (.rpm)
```bash
# Download the .rpm file, then:
sudo rpm -i dlman-*.rpm

# Or with dnf:
sudo dnf install dlman-*.rpm
```

### AppImage (Universal)
```bash
# Download the AppImage file
chmod +x DLMan_*.AppImage

# Run it
./DLMan_*.AppImage

# Optional: Move to /opt for system-wide access
sudo mv DLMan_*.AppImage /opt/dlman
sudo ln -s /opt/dlman /usr/local/bin/dlman
```

### Dependencies

If you encounter issues, ensure these dependencies are installed:

**Ubuntu/Debian:**
```bash
sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1 gtk3
```

---

## Building from Source

### Prerequisites

- **Node.js** 18+ with pnpm
- **Rust** 1.70+
- Platform-specific build tools (see below)

### Ubuntu/Debian Build Dependencies
```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libgtk-3-dev
```

### macOS Build Dependencies
```bash
xcode-select --install
```

### Windows Build Dependencies
- Visual Studio 2022 with C++ build tools
- WebView2 runtime (usually pre-installed on Windows 10/11)

### Build Steps

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/opendm.git
cd opendm

# Install dependencies
pnpm install

# Development mode
cd apps/desktop
pnpm tauri dev

# Production build
pnpm tauri build
```

Build outputs will be in `apps/desktop/src-tauri/target/release/bundle/`

---

## CLI Installation

The CLI tool can be built separately:

```bash
cd apps/cli
cargo build --release

# The binary will be at target/release/dlman
# Add to PATH or copy to /usr/local/bin
sudo cp target/release/dlman /usr/local/bin/
```

### CLI Usage

```bash
# Download a file
dlman add https://example.com/file.zip

# List downloads
dlman list

# Get help
dlman --help
```

---

## Troubleshooting

### macOS: "DLMan is damaged and can't be opened"
This happens when the app is quarantined. Run:
```bash
xattr -cr /Applications/DLMan.app
```

### Linux: Missing libraries
Install WebKit2GTK:
```bash
# Ubuntu/Debian
sudo apt-get install libwebkit2gtk-4.1-0

# Fedora
sudo dnf install webkit2gtk4.1
```

### Windows: WebView2 issues
Download and install WebView2 from:
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### Build fails with Rust errors
Ensure you have Rust 1.70 or newer:
```bash
rustup update stable
```

---

## Uninstallation

### Windows
Use "Add or Remove Programs" in Windows Settings

### macOS
Drag DLMan from Applications to Trash

### Linux (deb)
```bash
sudo apt-get remove dlman
```

### Linux (rpm)
```bash
sudo rpm -e dlman
```

### Linux (AppImage)
Simply delete the AppImage file
