#!/bin/bash
# DLMan macOS Installation Helper
# This script removes the quarantine attribute from DLMan
# Run this after copying DLMan.app to /Applications

set -e

APP_PATH="/Applications/DLMan.app"

echo "🚀 DLMan macOS Installation Helper"
echo "=================================="
echo ""

if [ -d "$APP_PATH" ]; then
    echo "📦 Found DLMan at $APP_PATH"
    echo "🔓 Removing quarantine attribute..."
    xattr -cr "$APP_PATH"
    echo ""
    echo "✅ Success! DLMan is now ready to use."
    echo ""
    echo "You can open DLMan from:"
    echo "  • Launchpad"
    echo "  • Applications folder"
    echo "  • Spotlight (Cmd + Space, type 'DLMan')"
    echo ""
else
    echo "❌ DLMan.app not found in /Applications"
    echo ""
    echo "Please follow these steps:"
    echo "  1. Download DLMan from the releases page"
    echo "  2. Open the .dmg file"
    echo "  3. Drag DLMan.app to the Applications folder"
    echo "  4. Run this script again"
    echo ""
    echo "Alternatively, run manually:"
    echo "  xattr -cr /path/to/DLMan.app"
    exit 1
fi
