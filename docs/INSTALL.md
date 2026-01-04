# Installation

Download from [Releases](https://github.com/novincode/dlman/releases).

## Windows

1. Download `.msi` or `.exe`
2. Run installer
3. Done

## macOS

### Installation Steps

1. **Download the DMG**
   - Intel Mac: Download `DLMan_*_x64.dmg`
   - Apple Silicon (M1/M2/M3): Download `DLMan_*_aarch64.dmg`

2. **Install the App**
   - Open the `.dmg` file
   - Drag DLMan to your Applications folder

3. **First Launch (Required for unsigned apps)**
   
   Since DLMan is not signed with an Apple Developer certificate, macOS will block it by default. You have two options:

   **Option A: Remove quarantine via Terminal (Recommended)**
   ```bash
   xattr -cr /Applications/DLMan.app
   ```
   Then open DLMan normally.

   **Option B: Manual bypass**
   - Try to open DLMan (it will be blocked)
   - Go to **System Preferences → Security & Privacy → General**
   - Click **"Open Anyway"** next to the DLMan message
   - Click **"Open"** in the confirmation dialog

4. **Grant Permissions**
   - On first launch, you may be asked to allow:
     - **Notifications** - For download complete alerts
     - **Downloads folder access** - If saving there
   - Click "Allow" for the best experience

### Troubleshooting

**"App is damaged and can't be opened"**
```bash
xattr -cr /Applications/DLMan.app
```

**"Cannot be opened because the developer cannot be verified"**
- Use Option A or B from step 3 above

**Notifications not working**
1. Go to **System Preferences → Notifications**
2. Find DLMan in the list
3. Enable **Allow Notifications**

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
