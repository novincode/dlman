/**
 * Video Overlay — IDM-style download bar on detected videos.
 *
 * Design: A compact dark toolbar at the top-right of video elements,
 * styled like IDM's classic [DLMan ↓ Download Video ▾ ×] toolbar.
 *
 * ISOLATION: Each overlay lives inside its own Shadow DOM host element,
 * so host-page CSS (Pornhub, YouTube, etc.) cannot interfere with styling.
 *
 * Uses `position: fixed` via a host element on `<html>`, NOT inside the
 * player's DOM. Tracks position via getBoundingClientRect() on scroll/resize.
 */

import type { DetectedMedia, MediaVariant, MediaDownloadRequest } from './media-types';

const OVERLAY_ATTR = 'data-dlman-overlay-id';
const Z = 2147483647;

const dismissed = new Set<string>();

// ============================================================================
// Shadow DOM styles (injected per shadow root — fully isolated)
// ============================================================================

function shadowCSS(): string {
  return `
:host{all:initial;position:fixed;z-index:${Z};display:block;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
.bar{display:flex;align-items:stretch;height:30px;border-radius:4px;overflow:visible;opacity:0;transform:translateY(-4px);transition:opacity .2s ease,transform .2s ease;pointer-events:auto;box-shadow:0 2px 10px rgba(0,0,0,.55);border:1px solid #444}
.bar.show{opacity:.92;transform:translateY(0)}
.bar:hover{opacity:1}
.bar.hide{display:none}
.brand{display:flex;align-items:center;gap:4px;padding:0 7px 0 6px;background:#1a1a1a;border-right:1px solid #333;border-radius:4px 0 0 4px;pointer-events:none;user-select:none}
.brand-icon{width:16px;height:16px;flex-shrink:0}
.brand-text{font-size:10px;font-weight:700;color:#5b9cf6;letter-spacing:.3px;text-transform:uppercase}
.main{display:flex;align-items:center;gap:5px;padding:0 9px;background:#1e1e1e;color:#e0e0e0;font-size:11.5px;font-weight:600;border:none;cursor:pointer;white-space:nowrap;line-height:1;transition:background .12s}
.main:hover{background:#2a5cdb}
.main.solo{border-radius:0 4px 4px 0}
.ico{width:14px;height:14px;flex-shrink:0;color:#5b9cf6}
.main:hover .ico{color:#fff}
.qbtn{display:flex;align-items:center;padding:0 5px;background:#1e1e1e;color:#999;border:none;border-left:1px solid #333;cursor:pointer;transition:background .12s,color .12s}
.qbtn:hover{background:#2a5cdb;color:#fff}
.x{display:flex;align-items:center;justify-content:center;width:26px;background:#1e1e1e;color:#777;border:none;border-left:1px solid #333;border-radius:0 4px 4px 0;cursor:pointer;font-size:14px;line-height:1;transition:background .12s,color .12s}
.x:hover{background:#c0392b;color:#fff}
.x.solo{border-radius:0 4px 4px 0}
.dd{position:absolute;top:calc(100% + 4px);right:0;min-width:200px;background:#1a1a1a;border:1px solid #444;border-radius:5px;box-shadow:0 8px 28px rgba(0,0,0,.65);padding:4px 0;opacity:0;transform:translateY(-3px);transition:opacity .15s,transform .15s;pointer-events:none}
.dd.open{opacity:1;transform:translateY(0);pointer-events:auto}
.dd-hdr{padding:6px 10px 3px;font-size:9.5px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.06em}
.dd-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;font-size:11.5px;color:#ccc;cursor:pointer;transition:background .1s}
.dd-item:hover{background:#2a5cdb;color:#fff}
.dd-lbl{font-weight:600}
.dd-meta{font-size:9.5px;color:#666}
.dd-item:hover .dd-meta{color:rgba(255,255,255,.7)}
`;
}

// ============================================================================
// SVG Icons
// ============================================================================

/** DLMan brand icon — blue download arrow matching extension icon */
function icoBrand(): string {
  return `<svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
}

function icoDownload(): string {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
}

function icoChevron(): string {
  return `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
}

// ============================================================================
// Helpers
// ============================================================================

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

function fmtBitrate(bps: number): string {
  if (bps < 1000) return `${bps} bps`;
  if (bps < 1e6) return `${(bps / 1000).toFixed(0)} kbps`;
  return `${(bps / 1e6).toFixed(1)} Mbps`;
}

// ============================================================================
// VideoOverlayManager
// ============================================================================

export type OnDownloadRequest = (request: MediaDownloadRequest) => void;

interface Overlay {
  media: DetectedMedia;
  video: HTMLVideoElement | null;
  host: HTMLElement;       // <dlman-overlay> custom element host
  shadow: ShadowRoot;
  bar: HTMLElement;
  dropdown: HTMLElement | null;
  rafId: number | null;
}

export class VideoOverlayManager {
  private overlays = new Map<string, Overlay>();
  private onDownload: OnDownloadRequest;
  private scrollHandler: (() => void) | null = null;
  private resizeHandler: (() => void) | null = null;

  constructor(onDownload: OnDownloadRequest) {
    this.onDownload = onDownload;

    this.scrollHandler = () => this.repositionAll();
    this.resizeHandler = () => this.repositionAll();
    window.addEventListener('scroll', this.scrollHandler, { passive: true, capture: true });
    window.addEventListener('resize', this.resizeHandler, { passive: true });
  }

  // ---------- Public API ----------

  addOverlay(media: DetectedMedia, variants?: MediaVariant[]): void {
    if (dismissed.has(media.id)) return;
    if (this.overlays.has(media.id)) {
      const o = this.overlays.get(media.id)!;
      if (variants?.length) o.media = { ...media, variants };
      return;
    }

    const video = this.findVideo(media);
    if (!video) return;

    const hasMulti = variants && variants.length > 1;

    // Shadow DOM host — isolates all overlay CSS from host page
    const host = document.createElement('dlman-overlay');
    host.style.cssText = `all:initial;position:fixed;z-index:${Z};display:block;pointer-events:none`;
    const shadow = host.attachShadow({ mode: 'closed' });

    // Inject scoped styles
    const style = document.createElement('style');
    style.textContent = shadowCSS();
    shadow.appendChild(style);

    // Build: [DLMan icon | ↓ Download Video | ▾ | ×]
    const bar = document.createElement('div');
    bar.className = 'bar';

    // Brand section
    const brand = document.createElement('div');
    brand.className = 'brand';
    brand.innerHTML = `${icoBrand()}<span class="brand-text">DLMan</span>`;
    bar.appendChild(brand);

    // Main download button
    const main = document.createElement('button');
    main.className = 'main' + (hasMulti ? '' : ' solo');
    main.innerHTML = `${icoDownload()}<span>Download Video</span>`;
    main.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.doDownload(media, variants, hasMulti ? undefined : 0);
    });
    bar.appendChild(main);

    // Quality chevron (only if multiple variants)
    if (hasMulti) {
      const qbtn = document.createElement('button');
      qbtn.className = 'qbtn';
      qbtn.innerHTML = icoChevron();
      qbtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleDropdown(media.id, bar, variants!);
      });
      bar.appendChild(qbtn);
    }

    // Close button
    const x = document.createElement('button');
    x.className = 'x' + (hasMulti ? '' : ' solo');
    x.textContent = '×';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      dismissed.add(media.id);
      this.removeOverlay(media.id);
    });
    bar.appendChild(x);

    shadow.appendChild(bar);

    const overlay: Overlay = {
      media: variants ? { ...media, variants } : media,
      video,
      host,
      shadow,
      bar,
      dropdown: null,
      rafId: null,
    };

    this.positionFixed(host, video);
    document.documentElement.appendChild(host);
    requestAnimationFrame(() => bar.classList.add('show'));

    this.overlays.set(media.id, overlay);
    video.setAttribute(OVERLAY_ATTR, media.id);
  }

  removeOverlay(id: string): void {
    const o = this.overlays.get(id);
    if (o) {
      this.cleanup(o);
      this.overlays.delete(id);
    }
  }

  destroy(): void {
    for (const o of this.overlays.values()) this.cleanup(o);
    this.overlays.clear();
    if (this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler, true);
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
  }

  // ---------- Positioning ----------

  private repositionAll(): void {
    for (const o of this.overlays.values()) {
      if (!o.video) continue;
      if (o.rafId) cancelAnimationFrame(o.rafId);
      o.rafId = requestAnimationFrame(() => {
        this.positionFixed(o.host, o.video!);
        o.rafId = null;
      });
    }
  }

  private positionFixed(host: HTMLElement, video: HTMLVideoElement): void {
    const vr = video.getBoundingClientRect();
    if (vr.bottom < 0 || vr.top > window.innerHeight || vr.right < 0 || vr.left > window.innerWidth) {
      host.style.display = 'none';
      return;
    }
    host.style.display = 'block';

    // Top-right of the video, 8px inset
    const top = vr.top + 8;
    const right = window.innerWidth - vr.right + 8;
    host.style.top = `${top}px`;
    host.style.right = `${right}px`;
    host.style.left = 'auto';
  }

  // ---------- Dropdown ----------

  private toggleDropdown(id: string, anchor: HTMLElement, variants: MediaVariant[]): void {
    const o = this.overlays.get(id);
    if (!o) return;
    if (o.dropdown) { this.closeDropdown(o); return; }

    const dd = document.createElement('div');
    dd.className = 'dd';

    const hdr = document.createElement('div');
    hdr.className = 'dd-hdr';
    hdr.textContent = 'Quality';
    dd.appendChild(hdr);

    variants.forEach((v, i) => {
      const item = document.createElement('div');
      item.className = 'dd-item';

      const lbl = document.createElement('span');
      lbl.className = 'dd-lbl';
      lbl.textContent = v.label;

      const meta = document.createElement('span');
      meta.className = 'dd-meta';
      const parts: string[] = [];
      if (v.codecs) parts.push(v.codecs.split(',')[0]);
      if (v.estimated_size) parts.push(fmtSize(v.estimated_size));
      if (v.bandwidth) parts.push(fmtBitrate(v.bandwidth));
      meta.textContent = parts.join(' · ');

      item.appendChild(lbl);
      if (parts.length) item.appendChild(meta);
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.doDownload(o.media, variants, i);
        this.closeDropdown(o);
      });
      dd.appendChild(item);
    });

    anchor.appendChild(dd);
    o.dropdown = dd;
    requestAnimationFrame(() => dd.classList.add('open'));

    // Close dropdown on outside click (listen on document, not shadow)
    const outside = (e: MouseEvent) => {
      // Check if click is inside our shadow root
      const path = e.composedPath();
      if (!path.includes(o.host)) {
        this.closeDropdown(o);
        document.removeEventListener('click', outside, true);
      }
    };
    setTimeout(() => document.addEventListener('click', outside, true), 0);
  }

  private closeDropdown(o: Overlay): void {
    if (!o.dropdown) return;
    o.dropdown.classList.remove('open');
    setTimeout(() => { o.dropdown?.remove(); o.dropdown = null; }, 180);
  }

  // ---------- Download ----------

  private doDownload(media: DetectedMedia, variants?: MediaVariant[], idx?: number): void {
    this.onDownload({ media: variants ? { ...media, variants } : media, variant_index: idx });
  }

  // ---------- Find Video ----------

  private findVideo(media: DetectedMedia): HTMLVideoElement | null {
    // First: match by URL
    for (const v of document.querySelectorAll('video')) {
      const el = v as HTMLVideoElement;
      if (el.getAttribute(OVERLAY_ATTR)) continue;
      const src = el.currentSrc || el.src;
      if (src && this.urlMatch(src, media.master_url)) return el;
      for (const s of el.querySelectorAll('source')) {
        if ((s as HTMLSourceElement).src && this.urlMatch((s as HTMLSourceElement).src, media.master_url)) return el;
      }
    }
    // Fallback: largest visible video
    let best: HTMLVideoElement | null = null;
    let area = 0;
    for (const v of document.querySelectorAll('video')) {
      const el = v as HTMLVideoElement;
      if (el.getAttribute(OVERLAY_ATTR)) continue;
      const r = el.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area && r.width > 200 && r.height > 120) { area = a; best = el; }
    }
    return best;
  }

  private urlMatch(a: string, b: string): boolean {
    try {
      const ua = new URL(a);
      const ub = new URL(b);
      return ua.origin === ub.origin && ua.pathname === ub.pathname;
    } catch { return a === b; }
  }

  // ---------- Cleanup ----------

  private cleanup(o: Overlay): void {
    o.host.remove();
    if (o.rafId) cancelAnimationFrame(o.rafId);
    if (o.video) o.video.removeAttribute(OVERLAY_ATTR);
  }
}
