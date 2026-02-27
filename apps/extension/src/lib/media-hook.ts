/**
 * MAIN-world media interception hooks.
 *
 * This script is injected into the page's MAIN world (not the extension's
 * isolated content script world) so it can intercept the page's own
 * `fetch()`, `XMLHttpRequest`, and `MediaSource` / `SourceBuffer` calls.
 *
 * What it intercepts:
 * 1. `fetch()` — catches m3u8/mpd manifest requests that webRequest may miss
 * 2. `XMLHttpRequest` — same, for legacy players
 * 3. `URL.createObjectURL(MediaSource)` — maps blob: URLs back to their MediaSource
 * 4. `SourceBuffer.appendBuffer()` — detects MIME types being fed to MSE
 *
 * Communication:
 *   This script runs in the PAGE world, so it cannot use browser.runtime APIs.
 *   Instead it uses `window.postMessage()` to send detected URLs to the
 *   content script, which runs in the ISOLATED world and forwards to background.
 *
 * WHY THIS IS NEEDED:
 *   - `webRequest` sees network requests but NOT JavaScript-constructed fetch()
 *     calls that some players make from within the page context.
 *   - Sites like YouTube, Aparat, and others generate manifest URLs dynamically
 *     via JavaScript fetch(), which webRequest *does* see. BUT some sites use
 *     service workers or construct requests in ways that webRequest misses.
 *   - `URL.createObjectURL(mediaSource)` creates blob: URLs that are invisible
 *     to webRequest entirely. This hook tracks them.
 */

const DLMAN_HOOK_ID = '__dlman_media_hook__';

// Prevent double-injection
if (!(window as any)[DLMAN_HOOK_ID]) {
  (window as any)[DLMAN_HOOK_ID] = true;

  const HLS_PATTERN = /\.m3u8(\?|#|$)/i;
  const DASH_PATTERN = /\.mpd(\?|#|$)/i;
  const VIDEO_PATTERN = /\.(mp4|webm|mkv|mov|m4v|flv)(\?|#|$)/i;
  const MANIFEST_MIMES = /mpegurl|dash\+xml/i;
  const VIDEO_MIMES = /^video\//i;
  const AD_DOMAINS = /doubleclick\.net|googlesyndication|googleadservices|facebook\.com\/tr|analytics|adserver|adsystem|sabavision\.com|imasdk\.googleapis|moatads|serving-sys\.com/i;

  // Already-sent URLs (deduplicate)
  const sent = new Set<string>();

  function urlBase(url: string): string {
    try {
      const u = new URL(url, location.href);
      return u.origin + u.pathname;
    } catch {
      return url;
    }
  }

  function classify(url: string, mime?: string): string | null {
    if (AD_DOMAINS.test(url)) return null;
    if (HLS_PATTERN.test(url) || (mime && MANIFEST_MIMES.test(mime) && mime.includes('mpegurl'))) return 'hls';
    if (DASH_PATTERN.test(url) || (mime && MANIFEST_MIMES.test(mime) && mime.includes('dash'))) return 'dash';
    if (VIDEO_PATTERN.test(url) || (mime && VIDEO_MIMES.test(mime))) return 'direct';
    return null;
  }

  function emit(url: string, protocol: string) {
    // Skip localhost, data:, blob: (blob is handled separately)
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return;

    const key = urlBase(url);
    if (sent.has(key)) return;
    sent.add(key);

    window.postMessage({
      source: 'dlman-media-hook',
      type: 'media-url-detected',
      url,
      protocol,
    }, '*');
  }

  // =========================================================================
  // 1. Hook fetch()
  // =========================================================================

  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: string | undefined;
    try {
      if (typeof input === 'string') {
        url = new URL(input, location.href).toString();
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input instanceof Request) {
        url = input.url;
      }
    } catch { /* ignore */ }

    if (url) {
      const proto = classify(url);
      if (proto) emit(url, proto);
    }

    // Call original and also check response content-type
    return originalFetch.apply(this, arguments as any).then((resp) => {
      if (url && resp.ok) {
        const ct = resp.headers.get('content-type');
        if (ct) {
          const proto = classify(url, ct);
          if (proto) emit(url, proto);
        }
      }
      return resp;
    });
  };

  // =========================================================================
  // 2. Hook XMLHttpRequest
  // =========================================================================

  const XHRProto = XMLHttpRequest.prototype;
  const originalOpen = XHRProto.open;
  const originalSend = XHRProto.send;

  XHRProto.open = function (method: string, url: string | URL, ...rest: any[]) {
    try {
      const resolved = new URL(typeof url === 'string' ? url : url.toString(), location.href).toString();
      (this as any).__dlman_url = resolved;
      const proto = classify(resolved);
      if (proto) emit(resolved, proto);
    } catch { /* ignore */ }
    return originalOpen.apply(this, [method, url, ...rest] as any);
  };

  XHRProto.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener('load', function () {
      const url = (this as any).__dlman_url;
      if (!url) return;
      const ct = this.getResponseHeader('content-type');
      if (ct) {
        const proto = classify(url, ct);
        if (proto) emit(url, proto);
      }
    }, { once: true });
    return originalSend.apply(this, arguments as any);
  };

  // =========================================================================
  // 3. Hook URL.createObjectURL — track blob: ↔ MediaSource mapping
  // =========================================================================

  const originalCreateObjectURL = URL.createObjectURL;
  const blobMediaSources = new WeakMap<MediaSource, string>();

  URL.createObjectURL = function (obj: Blob | MediaSource): string {
    const blobUrl = originalCreateObjectURL.call(this, obj);
    if (obj instanceof MediaSource) {
      blobMediaSources.set(obj, blobUrl);
      // Notify that a MSE-powered video exists on this page
      window.postMessage({
        source: 'dlman-media-hook',
        type: 'mse-blob-created',
        blobUrl,
        pageUrl: location.href,
      }, '*');
    }
    return blobUrl;
  };

  // =========================================================================
  // 4. Hook SourceBuffer.appendBuffer — detect MIME types in use
  // =========================================================================

  if (typeof MediaSource !== 'undefined') {
    const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;

    MediaSource.prototype.addSourceBuffer = function (mimeType: string): SourceBuffer {
      const sb = originalAddSourceBuffer.call(this, mimeType);

      // Notify about the MIME type being used (helps identify stream type)
      window.postMessage({
        source: 'dlman-media-hook',
        type: 'mse-source-buffer',
        mimeType,
        pageUrl: location.href,
      }, '*');

      return sb;
    };
  }
}

export {};
