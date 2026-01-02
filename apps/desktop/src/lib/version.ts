/**
 * Version management and update checking utilities
 * 
 * This module provides:
 * - Getting the current app version from Tauri
 * - Checking GitHub for new releases
 * - Comparing versions
 */

import { getVersion as getTauriVersion, getName as getTauriName } from '@tauri-apps/api/app';

const GITHUB_REPO = 'novincode/dlman';
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

export interface VersionInfo {
  current: string;
  appName: string;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string | null;
  currentVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
}

// Cache for version info
let cachedVersion: VersionInfo | null = null;

/**
 * Get the current app version from Tauri
 * Falls back to a default if not in Tauri context
 */
export async function getAppVersion(): Promise<VersionInfo> {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    // Check if we're in Tauri context
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      const [version, name] = await Promise.all([
        getTauriVersion(),
        getTauriName()
      ]);
      cachedVersion = { current: version, appName: name };
      return cachedVersion;
    }
  } catch (err) {
    console.warn('Failed to get version from Tauri:', err);
  }

  // Fallback for development/browser mode
  cachedVersion = { current: '1.3.1', appName: 'DLMan' };
  return cachedVersion;
}

/**
 * Compare two semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  // Remove 'v' prefix if present
  const clean1 = v1.replace(/^v/, '');
  const clean2 = v2.replace(/^v/, '');

  const parts1 = clean1.split('.').map(Number);
  const parts2 = clean2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * Check GitHub for new releases
 * Returns update info including whether an update is available
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const { current } = await getAppVersion();

  try {
    const response = await fetch(GITHUB_RELEASES_API, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        // User-Agent is required by GitHub API
        'User-Agent': 'DLMan-Update-Checker'
      }
    });

    if (!response.ok) {
      console.warn('GitHub API response not OK:', response.status);
      return {
        hasUpdate: false,
        latestVersion: null,
        currentVersion: current,
        releaseUrl: GITHUB_RELEASES_PAGE
      };
    }

    const release = await response.json();
    const latestVersion = release.tag_name?.replace(/^v/, '') || null;

    if (!latestVersion) {
      return {
        hasUpdate: false,
        latestVersion: null,
        currentVersion: current,
        releaseUrl: GITHUB_RELEASES_PAGE
      };
    }

    const hasUpdate = compareVersions(latestVersion, current) > 0;

    return {
      hasUpdate,
      latestVersion,
      currentVersion: current,
      releaseUrl: release.html_url || GITHUB_RELEASES_PAGE,
      releaseNotes: release.body || undefined,
      publishedAt: release.published_at || undefined
    };
  } catch (err) {
    console.error('Failed to check for updates:', err);
    return {
      hasUpdate: false,
      latestVersion: null,
      currentVersion: current,
      releaseUrl: GITHUB_RELEASES_PAGE
    };
  }
}

/**
 * Get the GitHub releases page URL
 */
export function getReleasesPageUrl(): string {
  return GITHUB_RELEASES_PAGE;
}

/**
 * Format a version string for display
 */
export function formatVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}
