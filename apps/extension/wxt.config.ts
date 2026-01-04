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
    // Note: Generate PNG icons from the SVGs in public/icon/
    // For development, WXT will generate placeholder icons
    action: {
      default_title: 'DLMan',
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
