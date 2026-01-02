# Installation

Download from [Releases](https://github.com/novincode/dlman/releases).

## Windows

1. Download `.msi` or `.exe`
2. Run installer
3. Done

## macOS

1. Download `.dmg` (Intel: x64, Apple Silicon: aarch64)
2. Drag to Applications
3. Run in Terminal:
   ```bash
   xattr -cr /Applications/DLMan.app
   ```
4. Open DLMan

## Linux

**Debian/Ubuntu:**
```bash
sudo dpkg -i dlman_*_amd64.deb
```

**Fedora/RHEL:**
```bash
sudo dnf install dlman-*.rpm
```

**AppImage:**
```bash
chmod +x DLMan_*.AppImage
./DLMan_*.AppImage
```
