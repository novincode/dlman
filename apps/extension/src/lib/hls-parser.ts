/**
 * Lightweight HLS manifest parser for the browser extension.
 *
 * This runs in the content script to parse master playlists
 * and extract quality variants for the quality picker UI.
 *
 * It does NOT download segments — that's the core engine's job.
 * This only fetches and parses the master playlist to show options.
 */

import type { MediaVariant } from './media-types';

// ============================================================================
// Parse Master Playlist
// ============================================================================

/**
 * Fetch and parse an HLS master playlist, returning available variants.
 * Returns an empty array if the URL is a media playlist (no variants).
 */
export async function resolveHlsVariants(
  masterUrl: string,
  cookies?: string,
  referrer?: string,
): Promise<MediaVariant[]> {
  try {
    const headers: Record<string, string> = {};
    if (cookies) headers['Cookie'] = cookies;
    if (referrer) headers['Referer'] = referrer;

    const response = await fetch(masterUrl, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn(`[DLMan] Failed to fetch m3u8: ${response.status}`);
      return [];
    }

    const content = await response.text();
    return parseMasterPlaylist(content, masterUrl);
  } catch (error) {
    console.warn('[DLMan] Failed to resolve HLS variants:', error);
    return [];
  }
}

/**
 * Parse an m3u8 playlist string. If it's a master playlist,
 * returns the quality variants. Otherwise returns empty array.
 */
export function parseMasterPlaylist(content: string, baseUrl: string): MediaVariant[] {
  if (!content.includes('#EXT-X-STREAM-INF')) {
    // Not a master playlist — single quality
    return [];
  }

  const variants: MediaVariant[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

    const attrs = line.substring('#EXT-X-STREAM-INF:'.length);
    const bandwidth = parseAttr(attrs, 'BANDWIDTH');
    const resolution = parseAttr(attrs, 'RESOLUTION');
    const codecs = parseAttr(attrs, 'CODECS');

    // Next non-empty, non-comment line is the URL
    let variantUrl = '';
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (next && !next.startsWith('#')) {
        variantUrl = resolveUrl(baseUrl, next);
        break;
      }
    }

    if (!variantUrl) continue;

    const bw = bandwidth ? parseInt(bandwidth, 10) : undefined;
    const [width, height] = resolution ? parseResolution(resolution) : [undefined, undefined];

    variants.push({
      url: variantUrl,
      label: buildLabel(height, bw),
      width,
      height,
      bandwidth: bw,
      codecs: codecs || undefined,
      audio_only: !width && !height,
      estimated_size: undefined,
    });
  }

  // Sort by bandwidth descending (best first)
  variants.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  return variants;
}

// ============================================================================
// Helpers
// ============================================================================

function parseAttr(attrs: string, name: string): string | null {
  // Handle quoted values like CODECS="avc1.4d401f,mp4a.40.2"
  const regex = new RegExp(`${name}=(?:"([^"]+)"|([^,\\s]+))`);
  const match = attrs.match(regex);
  return match ? (match[1] ?? match[2]) : null;
}

function parseResolution(res: string): [number | undefined, number | undefined] {
  const [w, h] = res.split('x').map(Number);
  return [w || undefined, h || undefined];
}

function resolveUrl(base: string, relative: string): string {
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    return relative;
  }
  try {
    return new URL(relative, base).toString();
  } catch {
    return relative;
  }
}

function buildLabel(height?: number, bandwidth?: number): string {
  if (height) return `${height}p`;
  if (bandwidth) {
    if (bandwidth > 1_000_000) return `${(bandwidth / 1_000_000).toFixed(1)} Mbps`;
    return `${Math.round(bandwidth / 1000)} kbps`;
  }
  return 'Unknown';
}
