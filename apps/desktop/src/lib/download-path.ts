// Utilities for determining download paths based on OS and category

import { homeDir, downloadDir } from '@tauri-apps/api/path';
import { useCategoryStore, type Category } from '@/stores/categories';

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

/**
 * Get the default base download path for the current OS
 * This will be something like /Users/name/Downloads/DLMan on macOS
 */
export async function getDefaultBasePath(): Promise<string> {
  if (!isTauri()) {
    return '~/Downloads/DLMan';
  }
  
  try {
    const downloads = await downloadDir();
    return `${downloads}/DLMan`;
  } catch (err) {
    console.error('Failed to get download dir:', err);
    try {
      const home = await homeDir();
      return `${home}/Downloads/DLMan`;
    } catch (err2) {
      console.error('Failed to get home dir:', err2);
      return '~/Downloads/DLMan';
    }
  }
}

/**
 * Get the download path for a specific category
 */
export async function getCategoryDownloadPath(catId: string | null): Promise<string> {
  const basePath = await getDefaultBasePath();
  
  if (!catId) {
    return basePath;
  }
  
  const category = useCategoryStore.getState().categories.get(catId);
  if (!category) {
    return basePath;
  }
  
  // If category has a custom path, use it
  if (category.customPath) {
    return category.customPath;
  }
  
  // Otherwise, add category folder to base path
  return `${basePath}/${category.name}`;
}

/**
 * Detect category from file extension
 */
export function detectCategoryFromFilename(filename: string): Category | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  
  const categories = useCategoryStore.getState().categories;
  for (const category of categories.values()) {
    if (category.extensions.includes(ext)) {
      return category;
    }
  }
  
  return null;
}

/**
 * Get full download path for a file, including category subfolder
 */
export async function getDownloadPathForFile(filename: string, overrideCategoryId?: string): Promise<{
  path: string;
  category: Category | null;
}> {
  // Detect category from filename if not overridden
  let category: Category | null = null;
  
  if (overrideCategoryId) {
    category = useCategoryStore.getState().categories.get(overrideCategoryId) || null;
  } else {
    category = detectCategoryFromFilename(filename);
  }
  
  const path = await getCategoryDownloadPath(category?.id || null);
  
  return { path, category };
}

/**
 * Resolve path with ~ replaced by home directory
 */
export async function resolvePath(path: string): Promise<string> {
  if (!isTauri()) {
    return path;
  }
  
  if (path.startsWith('~')) {
    try {
      const home = await homeDir();
      return path.replace(/^~/, home.replace(/\/$/, ''));
    } catch (err) {
      console.error('Failed to resolve home dir:', err);
      return path;
    }
  }
  
  return path;
}
