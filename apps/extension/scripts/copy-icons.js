#!/usr/bin/env node
/**
 * Copy and resize icons from the Tauri desktop app to the extension.
 * This ensures consistent branding across desktop and browser extension.
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const extensionRoot = join(__dirname, '..');
const tauriIconsDir = join(__dirname, '..', '..', 'desktop', 'src-tauri', 'icons');
const extensionIconDir = join(extensionRoot, 'public/icon');

// Icon mappings: extension size -> tauri source file
const iconMappings = [
  { size: 16, source: '32x32.png' },      // Use 32x32 and let browser scale down
  { size: 32, source: '32x32.png' },
  { size: 48, source: '64x64.png' },      // Use closest available size
  { size: 128, source: '128x128.png' },
];

console.log('📦 Copying icons from Tauri to extension...\n');

// Ensure icon directory exists
if (!existsSync(extensionIconDir)) {
  mkdirSync(extensionIconDir, { recursive: true });
}

// Copy each icon
for (const { size, source } of iconMappings) {
  const sourcePath = join(tauriIconsDir, source);
  const destPath = join(extensionIconDir, `${size}.png`);

  if (existsSync(sourcePath)) {
    copyFileSync(sourcePath, destPath);
    console.log(`  ✓ ${source} → ${size}.png`);
  } else {
    console.log(`  ⚠ Source not found: ${source}`);
  }
}

console.log('\n✅ Icons copied successfully!');
console.log('   Note: For best quality, consider using sharp or imagemagick to resize.');
