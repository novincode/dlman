/**
 * Video Detector — observes DOM for media elements and accepts
 * externally-detected stream URLs from the background script.
 *
 * Detection strategies:
 * 1. DOM scan: enumerate existing <video>, <audio>, <source> elements
 * 2. MutationObserver: watch for newly-added media elements
 * 3. External injection: accept URLs from background (via webRequest API)
 * 4. Media events: listen for loadedmetadata / canplay / playing
 *
 * Why no in-content-script network interception?
 * Content scripts run in an isolated JavaScript world. Hooking
 * window.fetch / XHR in the content script only intercepts our own
 * requests, NOT the page's JS. Background script's webRequest API
 * is used instead for reliable cross-world network monitoring.
 */

import type { DetectedMedia, MediaProtocol } from './media-types';

// ============================================================================
// Constants
// ============================================================================

const DIRECT_VIDEO_EXT = /\.(mp4|webm|mkv|avi|mov|m4v|flv|wmv|ogv)(\?|#|$)/i;
const DIRECT_AUDIO_EXT = /\.(mp3|m4a|aac|ogg|opus|flac|wav)(\?|#|$)/i;
const HLS_PATTERN = /\.m3u8(\?|#|$)/i;
const DASH_PATTERN = /\.mpd(\?|#|$)/i;

/** Ad / tracking domains — never treat these as real media even if they match */
const AD_DOMAINS = /doubleclick\.net|googlesyndication|googleadservices|facebook\.com\/tr|analytics|adserver|adsystem|sabavision\.com|imasdk\.googleapis|moatads|serving-sys\.com/i;

const MEDIA_MIMES: Record<string, MediaProtocol> = {
  'application/vnd.apple.mpegurl': 'hls',
  'application/x-mpegurl': 'hls',
  'audio/mpegurl': 'hls',
  'audio/x-mpegurl': 'hls',
  'application/dash+xml': 'dash',
  'video/mp4': 'direct',
  'video/webm': 'direct',
  'video/ogg': 'direct',
  'audio/mpeg': 'direct',
  'audio/mp4': 'direct',
  'audio/ogg': 'direct',
  'audio/webm': 'direct',
};

/** Minimum video element dimensions to show overlay (filters thumbnails) */
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

/** Minimum duration in seconds — skip short clips / ads */
const MIN_DURATION = 8;

/** Data attribute used to tag video elements we've processed */
const VID_ATTR = 'data-dlman-vid';

// ============================================================================
// Classification Helpers
// ============================================================================

function classifyUrl(url: string): MediaProtocol | null {
  if (HLS_PATTERN.test(url)) return 'hls';
  if (DASH_PATTERN.test(url)) return 'dash';
  if (DIRECT_VIDEO_EXT.test(url)) return 'direct';
  if (DIRECT_AUDIO_EXT.test(url)) return 'direct';
  return null;
}

function classifyMime(mime: string): MediaProtocol | null {
  return MEDIA_MIMES[mime.toLowerCase().split(';')[0].trim()] ?? null;
}

function stableId(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function suggestFilename(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    // Walk backwards through path segments, skipping manifest names
    const parts = pathname.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const seg = decodeURIComponent(parts[i].split('?')[0]).toLowerCase();
      // Skip HLS/DASH manifest files — these are not meaningful filenames
      if (seg.endsWith('.m3u8') || seg.endsWith('.mpd') ||
          seg === 'master' || seg === 'index' || seg === 'playlist' ||
          seg === 'hls' || seg === 'dash' || !seg.includes('.')) {
        continue;
      }
      return decodeURIComponent(parts[i].split('?')[0]);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function isVideoLargeEnough(el: HTMLVideoElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width >= MIN_WIDTH && r.height >= MIN_HEIGHT;
}

/**
 * Detect if a video element is a thumbnail/preview — NOT the main player.
 * Thumbnail heuristics:
 * - `loop` attribute = auto-replaying preview
 * - `muted` + `autoplay` + small = hover/inline preview
 * - Very short known duration = preview clip
 *
 * NOTE: Many main video players use `muted + autoplay` to comply with
 * browser autoplay policies. We only flag muted+autoplay as thumbnail
 * when the video is ALSO small or has `loop`. Large muted+autoplay
 * videos are likely the main player that will be unmuted after
 * user interaction.
 */
function isThumbnailVideo(el: HTMLVideoElement): boolean {
  const r = el.getBoundingClientRect();
  const isSmall = r.width < MIN_WIDTH || r.height < MIN_HEIGHT;

  // Looping videos are almost always thumbnails / hover previews
  if (el.loop) return true;

  // Muted + autoplay + small = thumbnail preview
  // Large muted+autoplay videos are likely the main player (browser policy)
  if (el.muted && el.autoplay && isSmall) return true;

  // If we know the duration and it's very short, it's a preview
  if (el.duration && Number.isFinite(el.duration) && el.duration < 5) return true;

  return false;
}

// ============================================================================
// VideoDetector
// ============================================================================

export type OnMediaDetected = (media: DetectedMedia) => void;

export interface VideoDetectorOptions {
  /** Called when new media is detected */
  onDetected: OnMediaDetected;
  /** Minimum video duration in seconds (default: 8) */
  minDuration?: number;
  /** Whether to observe DOM mutations (default: true) */
  observeDOM?: boolean;
}

export class VideoDetector {
  private cb: OnMediaDetected;
  private minDur: number;
  private seen = new Set<string>();
  private observer: MutationObserver | null = null;
  private cleanups: Array<() => void> = [];
  private dead = false;

  /** All detected media keyed by ID — accessible for context menu lookups */
  readonly detected = new Map<string, DetectedMedia>();

  /** Stream URLs detected externally but not yet attached to a video element */
  private pendingStreams: Array<{ url: string; protocol: MediaProtocol }> = [];

  constructor(opts: VideoDetectorOptions) {
    this.cb = opts.onDetected;
    this.minDur = opts.minDuration ?? MIN_DURATION;
  }

  /** Start all detection strategies */
  start(): void {
    if (this.dead) return;

    // Strategy 1 + 2: Scan existing elements + observe new ones
    this.scanDOM();
    this.startObserver();
    this.startEventListeners();

    // Periodically re-check pending streams against visible videos
    const interval = setInterval(() => this.matchPendingStreams(), 2500);
    this.cleanups.push(() => clearInterval(interval));
  }

  /** Stop all detection and clean up */
  destroy(): void {
    this.dead = true;
    this.observer?.disconnect();
    this.observer = null;
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.seen.clear();
    this.detected.clear();
    this.pendingStreams = [];
  }

  /**
   * Inject a URL detected externally (e.g. via webRequest in background).
   * If a matching large video element exists, attaches to it immediately.
   * Otherwise the URL is queued and matched when a suitable video appears.
   *
   * The optional `protocol` parameter allows the caller (background script)
   * to pass the already-determined protocol, so URLs without obvious file
   * extensions (e.g. CDN endpoints) are still properly handled.
   */
  injectStreamUrl(url: string, protocol?: MediaProtocol): void {
    if (this.dead) return;
    // Skip ad/tracking domains
    if (AD_DOMAINS.test(url)) return;

    // Use provided protocol, or try to classify from URL
    const proto = protocol || classifyUrl(url);
    // If we still can't classify, default to 'direct' — the background script
    // already confirmed this is a video URL via Content-Type header.
    const finalProto: MediaProtocol = proto || 'direct';

    const id = stableId(url);
    if (this.seen.has(id)) return;

    // Try to find a large video element to associate with
    const video = this.findLargestUntaggedVideo();
    if (video) {
      this.seen.add(id);
      this.emitMediaForVideo(url, finalProto, video);
    } else {
      // Queue for later matching
      if (!this.pendingStreams.some((s) => stableId(s.url) === id)) {
        this.pendingStreams.push({ url, protocol: finalProto });
      }
    }
  }

  /**
   * Get DetectedMedia for the video element closest to given viewport point.
   * Used by right-click context menu.
   */
  getMediaNearPoint(x: number, y: number): DetectedMedia | null {
    // Check elements directly at the point
    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      const video =
        el instanceof HTMLVideoElement ? el : (el.closest?.('video') as HTMLVideoElement | null);
      if (video) {
        const attr = video.getAttribute(VID_ATTR);
        if (attr && this.detected.has(attr)) {
          return this.detected.get(attr)!;
        }
        // Check by URL match
        for (const media of this.detected.values()) {
          if (this.videoMatchesMedia(video, media)) return media;
        }
      }
    }

    // Fallback: nearest large video within 500px
    let bestMedia: DetectedMedia | null = null;
    let bestDist = Infinity;
    for (const v of document.querySelectorAll('video')) {
      const rect = v.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < bestDist && dist < 500) {
        for (const media of this.detected.values()) {
          if (this.videoMatchesMedia(v as HTMLVideoElement, media)) {
            bestDist = dist;
            bestMedia = media;
            break;
          }
        }
      }
    }
    return bestMedia;
  }

  /**
   * Get any detected media — returns the first detected item.
   * Useful as a fallback for context menu when point matching fails.
   */
  getAnyDetectedMedia(): DetectedMedia | null {
    for (const media of this.detected.values()) {
      return media;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // DOM Scanning
  // --------------------------------------------------------------------------

  private scanDOM(): void {
    document.querySelectorAll('video').forEach((v) => {
      this.processVideoElement(v as HTMLVideoElement);
    });
    document.querySelectorAll('audio').forEach((a) => {
      this.processAudioElement(a as HTMLAudioElement);
    });
    document.querySelectorAll('source').forEach((s) => {
      const src = (s as HTMLSourceElement).src;
      const type = (s as HTMLSourceElement).type;
      if (src) this.processMediaUrl(src, type || undefined);
    });
  }

  private startObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          if (el.tagName === 'VIDEO') this.processVideoElement(el as HTMLVideoElement);
          else if (el.tagName === 'AUDIO') this.processAudioElement(el as HTMLAudioElement);
          else if (el.tagName === 'SOURCE') {
            const src = (el as HTMLSourceElement).src;
            if (src) this.processMediaUrl(src, (el as HTMLSourceElement).type || undefined);
          }
          el.querySelectorAll?.('video')?.forEach((v) =>
            this.processVideoElement(v as HTMLVideoElement),
          );
          el.querySelectorAll?.('audio')?.forEach((a) =>
            this.processAudioElement(a as HTMLAudioElement),
          );
        }
        if (
          m.type === 'attributes' &&
          m.target instanceof HTMLVideoElement &&
          m.attributeName === 'src'
        ) {
          this.processVideoElement(m.target);
        }
      }
    });
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  }

  private startEventListeners(): void {
    const handler = (e: Event) => {
      if (e.target instanceof HTMLVideoElement) this.processVideoElement(e.target);
      else if (e.target instanceof HTMLAudioElement) this.processAudioElement(e.target);
    };
    document.addEventListener('loadedmetadata', handler, true);
    document.addEventListener('canplay', handler, true);
    document.addEventListener('playing', handler, true);
    this.cleanups.push(() => {
      document.removeEventListener('loadedmetadata', handler, true);
      document.removeEventListener('canplay', handler, true);
      document.removeEventListener('playing', handler, true);
    });
  }

  // --------------------------------------------------------------------------
  // Element Processing
  // --------------------------------------------------------------------------

  private processVideoElement(video: HTMLVideoElement): void {
    // Skip thumbnail/preview videos (loop, muted+autoplay, etc.)
    if (isThumbnailVideo(video)) return;

    // Must be large enough to be a real player (skip small thumbnails)
    if (!isVideoLargeEnough(video)) return;

    const url = video.currentSrc || video.src;

    // blob: or data: URLs — these come from MediaSource API (HLS/DASH players).
    // The actual stream URL was fetched by the page's JS and caught by webRequest.
    // Try to match this video element with a pending stream from background.
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) {
      // First check <source> children for real URLs
      let foundSrc = false;
      for (const source of video.querySelectorAll('source')) {
        const src = (source as HTMLSourceElement).src;
        if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
          this.processMediaUrl(src, (source as HTMLSourceElement).type || undefined, video);
          foundSrc = true;
        }
      }
      // If no real source found, try matching with a webRequest-detected stream
      if (!foundSrc) {
        this.tryMatchPendingStream(video);
      }
      return;
    }

    // Filter short clips (ads, previews)
    if (video.duration && Number.isFinite(video.duration) && video.duration < this.minDur) {
      return;
    }

    this.processMediaUrl(url, undefined, video);
  }

  private processAudioElement(audio: HTMLAudioElement): void {
    const url = audio.currentSrc || audio.src;
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;
    this.processMediaUrl(url);
  }

  // --------------------------------------------------------------------------
  // Core URL Processing
  // --------------------------------------------------------------------------

  private processMediaUrl(
    url: string,
    mimeType?: string,
    video?: HTMLVideoElement,
  ): void {
    if (this.dead) return;
    // Skip ad/tracking domains
    if (AD_DOMAINS.test(url)) return;

    let protocol = classifyUrl(url);
    if (!protocol && mimeType) protocol = classifyMime(mimeType);
    if (!protocol) return;

    const id = stableId(url);
    if (this.seen.has(id)) return;
    this.seen.add(id);

    if (video) {
      this.emitMediaForVideo(url, protocol, video);
    } else {
      const media: DetectedMedia = {
        id,
        page_url: window.location.href,
        page_title: document.title || undefined,
        master_url: url,
        protocol,
        variants: [],
        mime_type: mimeType,
        filename: suggestFilename(url),
        referrer: document.referrer || window.location.href,
      };
      this.detected.set(id, media);
      this.cb(media);
    }
  }

  private emitMediaForVideo(
    url: string,
    protocol: MediaProtocol,
    video: HTMLVideoElement,
  ): void {
    const id = stableId(url);
    const media: DetectedMedia = {
      id,
      page_url: window.location.href,
      page_title: document.title || undefined,
      master_url: url,
      protocol,
      variants: [],
      filename: suggestFilename(url),
      duration:
        video.duration && Number.isFinite(video.duration) ? video.duration : undefined,
      thumbnail:
        video.poster && !video.poster.startsWith('data:') ? video.poster : undefined,
      referrer: document.referrer || window.location.href,
      element_rect: video.getBoundingClientRect(),
    };
    video.setAttribute(VID_ATTR, id);
    this.detected.set(id, media);
    this.cb(media);
  }

  // --------------------------------------------------------------------------
  // Pending Stream Matching
  // --------------------------------------------------------------------------

  private tryMatchPendingStream(video: HTMLVideoElement): void {
    if (this.pendingStreams.length === 0) return;
    if (!isVideoLargeEnough(video)) return;
    if (video.getAttribute(VID_ATTR)) return;

    const stream = this.pendingStreams.shift()!;
    const id = stableId(stream.url);
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.emitMediaForVideo(stream.url, stream.protocol, video);
  }

  private matchPendingStreams(): void {
    if (this.pendingStreams.length === 0) return;
    const video = this.findLargestUntaggedVideo();
    if (!video) return;
    this.tryMatchPendingStream(video);
  }

  // --------------------------------------------------------------------------
  // Video Element Utilities
  // --------------------------------------------------------------------------

  private findLargestUntaggedVideo(): HTMLVideoElement | null {
    let best: HTMLVideoElement | null = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll('video')) {
      const el = v as HTMLVideoElement;
      if (el.getAttribute(VID_ATTR)) continue;
      if (isThumbnailVideo(el)) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width >= MIN_WIDTH && r.height >= MIN_HEIGHT) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  }

  private videoMatchesMedia(video: HTMLVideoElement, media: DetectedMedia): boolean {
    // Match by data attribute
    if (video.getAttribute(VID_ATTR) === media.id) return true;
    // Match by URL
    const src = video.currentSrc || video.src;
    if (src && !src.startsWith('blob:')) {
      try {
        const a = new URL(src);
        const b = new URL(media.master_url);
        if (a.origin === b.origin && a.pathname === b.pathname) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }
}
