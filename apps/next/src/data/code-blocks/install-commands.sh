# macOS — Remove quarantine after install
xattr -cr /Applications/DLMan.app

# Linux — Install .deb package
sudo dpkg -i dlman_*_amd64.deb

# Linux — Install .rpm package
sudo dnf install dlman-*.rpm

# Linux — Run AppImage
chmod +x DLMan_*.AppImage && ./DLMan_*.AppImage