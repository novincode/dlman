#!/usr/bin/env node
/**
 * Copy and resize icons from the Tauri desktop app to the extension.
 * This ensures consistent branding across desktop and browser extension.
 */

import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const extensionRoot = join(__dirname, '..');
const tauriIconsDir = join(__dirname, '..', '..', 'desktop', 'src-tauri', 'icons');
const extensionIconDir = join(extensionRoot, 'public/icon');

// Icon mappings: extension size -> tauri source file
// Use closest available size for best quality
const iconMappings = [
  { size: 16, source: '32x32.png' },       // Scale down from 32
  { size: 32, source: '32x32.png' },       // Exact match
  { size: 48, source: '64x64.png' },       // Scale down from 64
  { size: 128, source: '128x128.png' },    // Exact match
];

console.log('📦 Copying icons from Tauri to extension...\n');
console.log('  Source:', tauriIconsDir);
console.log('  Dest:', extensionIconDir);
console.log('');

// Ensure icon directory exists
if (!existsSync(extensionIconDir)) {
  mkdirSync(extensionIconDir, { recursive: true });
}

let successCount = 0;
let errorCount = 0;

// Copy each icon
for (const { size, source } of iconMappings) {
  const sourcePath = join(tauriIconsDir, source);
  const destPath = join(extensionIconDir, `${size}.png`);

  if (existsSync(sourcePath)) {
    try {
      copyFileSync(sourcePath, destPath);
      console.log(`  ✓ ${source} → ${size}.png`);
      successCount++;
    } catch (err) {
      console.log(`  ✗ Failed to copy ${source}: ${err.message}`);
      errorCount++;
    }
  } else {
    console.log(`  ⚠ Source not found: ${source}`);
    errorCount++;
  }
}

console.log('');
if (errorCount === 0) {
  console.log(`✅ All ${successCount} icons copied successfully!`);
} else {
  console.log(`⚠️  Copied ${successCount} icons, ${errorCount} failed/missing`);
}
console.log('   Note: For exact sizes, use sharp or imagemagick to resize.');
