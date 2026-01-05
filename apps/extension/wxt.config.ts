import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Custom plugin to copy icons to build output
function copyIconsPlugin() {
  return {
    name: 'copy-icons',
    writeBundle(options) {
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
    description: 'Modern download manager - fast, beautiful, and free',
    version: '1.7.3',
    permissions: [
      'storage',
      'downloads',
      'contextMenus',
      'notifications',
      'activeTab',
      'clipboardRead',
    ],
    host_permissions: [
      'http://localhost:*/*',
      'ws://localhost:*/*',
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
