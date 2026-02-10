import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Custom plugin to copy icons to build output
function copyIconsPlugin() {
  return {
    name: 'copy-icons',
    writeBundle(options: any) {
      const outputDir = options.dir || 'dist/chrome-mv3';
      const iconSourceDir = path.resolve(__dirname, 'public', 'icon');
      const iconOutputDir = path.resolve(outputDir, 'icon');

      if (!fs.existsSync(iconSourceDir)) {
        console.warn('Icon source directory not found:', iconSourceDir);
        return;
      }

      if (!fs.existsSync(iconOutputDir)) {
        fs.mkdirSync(iconOutputDir, { recursive: true });
      }

      const files = fs.readdirSync(iconSourceDir);
      files.forEach((file) => {
        if (file.endsWith('.png')) {
          const src = path.join(iconSourceDir, file);
          const dst = path.join(iconOutputDir, file);
          fs.copyFileSync(src, dst);
        }
      });

      console.log(`✓ Icons copied to ${iconOutputDir}`);
    },
  };
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  publicDir: 'public',
  manifest: {
    name: 'DLMan - Download Manager',
    description: 'Intercept browser downloads and send them to DLMan desktop app for faster, resumable downloads with queue management.',
    version: '1.9.0',
    // Firefox-specific settings - REQUIRED for Firefox Add-ons
    browser_specific_settings: {
      gecko: {
        id: 'dlman@ideyenovin.gmail.com',
        strict_min_version: '109.0',
        // Required since Nov 2025 - declares NO external data collection
        // Extension only communicates with localhost (DLMan desktop app)
        // Cast to any because WXT types haven't been updated for data_collection_permissions
        data_collection_permissions: {
          required: ['none'],
        },
      } as any,
    },
    permissions: [
      'storage',        // Store user preferences (theme, port, disabled sites)
      'downloads',      // Intercept browser downloads to redirect to DLMan
      'contextMenus',   // "Download with DLMan" context menu option
      'notifications',  // Notify when download is added or app not running
      'activeTab',      // Get current tab URL for referrer header
      'clipboardRead',  // Paste URLs from clipboard in popup
      'alarms',         // Periodic reconnection to DLMan desktop app
    ],
    host_permissions: [
      'http://localhost:*/*',  // Communicate with DLMan desktop app HTTP API
      'ws://localhost:*/*',    // WebSocket connection for real-time download progress
    ],
    // Extension icons - copied from desktop app by copy-icons script
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'DLMan',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    web_accessible_resources: [
      {
        resources: ['icon/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
  vite: () => ({
    plugins: [react(), copyIconsPlugin()],
    publicDir: 'public',
    build: {
      target: 'esnext',
    },
  }),
});
