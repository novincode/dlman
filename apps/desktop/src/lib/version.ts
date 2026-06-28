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
 * Compare two semantic versions (pre-release aware).
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 *
 * Handles pre-release suffixes per semver: a version with a pre-release
 * (1.10.0-beta.1) is LOWER than its release (1.10.0). This keeps update
 * notifications correct for beta testers — once stable ships they're told to
 * upgrade, and they're never nagged to "update" to an older stable build.
 */
export function compareVersions(v1: string, v2: string): number {
  const parse = (v: string) => {
    const clean = v.replace(/^v/, '');
    const [core, pre = ''] = clean.split('-', 2);
    const nums = core.split('.').map((n) => parseInt(n, 10) || 0);
    return { nums, pre };
  };

  const a = parse(v1);
  const b = parse(v2);

  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
    const p1 = a.nums[i] || 0;
    const p2 = b.nums[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  // Equal cores: a release outranks a pre-release; otherwise compare suffixes.
  if (!a.pre && b.pre) return 1;
  if (a.pre && !b.pre) return -1;
  if (a.pre > b.pre) return 1;
  if (a.pre < b.pre) return -1;
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
