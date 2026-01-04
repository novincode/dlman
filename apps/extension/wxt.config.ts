import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  manifest: {
    name: 'DLMan - Download Manager',
    description: 'Modern download manager - fast, beautiful, and free',
    version: '1.6.0',
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
    plugins: [react()],
    build: {
      target: 'esnext',
    },
  }),
});
