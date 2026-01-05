import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number | null | undefined, decimals = 2): string {
  if (bytes === null || bytes === undefined || bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format speed to human readable string
 */
export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (!bytesPerSecond) return '0 B/s';
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format seconds to human readable duration
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '--:--';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Extract filename from URL
 */
export function extractFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'download';
    // Decode URI component and remove query params
    return decodeURIComponent(filename.split('?')[0] || filename);
  } catch {
    return 'download';
  }
}

/**
 * Check if a URL matches download patterns
 * Handles URLs with query parameters and fragments
 */
export function isDownloadableUrl(url: string, patterns: string[]): boolean {
  try {
    const urlObj = new URL(url);
    // Get just the pathname without query params
    const pathname = urlObj.pathname.toLowerCase();
    
    for (const pattern of patterns) {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .toLowerCase()
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      const regex = new RegExp(`${regexPattern}$`, 'i');
      if (regex.test(pathname)) {
        return true;
      }
    }
  } catch {
    // If URL parsing fails, try simple pattern matching on the full URL
    const lowercaseUrl = url.toLowerCase();
    for (const pattern of patterns) {
      const regexPattern = pattern
        .toLowerCase()
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      const regex = new RegExp(`${regexPattern}(\\?|#|$)`, 'i');
      if (regex.test(lowercaseUrl)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if a site is in the disabled list
 */
export function isSiteDisabled(url: string, disabledSites: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return disabledSites.some(site => {
      const pattern = site.toLowerCase();
      if (pattern.startsWith('*.')) {
        // Wildcard subdomain match
        const domain = pattern.slice(2);
        return hostname === domain || hostname.endsWith('.' + domain);
      }
      return hostname === pattern;
    });
  } catch {
    return false;
  }
}

/**
 * Get the current site's hostname
 */
export function getCurrentHostname(): string {
  try {
    return window.location.hostname;
  } catch {
    return '';
  }
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
