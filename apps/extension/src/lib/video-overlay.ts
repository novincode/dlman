/**
 * Video Overlay — IDM-style download bar on detected videos.
 *
 * Design: A single compact dark bar at the top-right of the video element,
 * styled like IDM's classic [↓ Download Video ▾ ×] toolbar.
 *
 * Uses `position: fixed` appended to `<html>`, NOT inside the player's DOM.
 * This prevents video player controls from intercepting clicks or z-index
 * wars inside the player's stacking context. The button tracks the video
 * element's viewport position on scroll/resize via getBoundingClientRect().
 */

import type { DetectedMedia, MediaVariant, MediaDownloadRequest } from './media-types';

const P = 'dlman-vo';
const OVERLAY_ATTR = 'data-dlman-overlay-id';
const Z = 2147483647;

const dismissed = new Set<string>();
let stylesReady = false;

// ============================================================================
// Styles (injected once)
// ============================================================================

function ensureStyles(): void {
  if (stylesReady) return;
  stylesReady = true;

  const s = document.createElement('style');
  s.textContent = `
.${P}{position:fixed;z-index:${Z};display:flex;align-items:stretch;height:28px;border-radius:3px;overflow:visible;opacity:0;transform:translateY(-4px);transition:opacity .2s ease,transform .2s ease;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.5)}
.${P}.show{opacity:.92;transform:translateY(0)}
.${P}:hover{opacity:1}
.${P}.hide{display:none}
.${P}-main{display:flex;align-items:center;gap:5px;padding:0 8px;background:#1e1e1e;color:#e0e0e0;font-size:11px;font-weight:600;border:1px solid #383838;border-right:none;border-radius:3px 0 0 3px;cursor:pointer;white-space:nowrap;line-height:1;transition:background .12s}
.${P}-main:hover{background:#2a5cdb}
.${P}-main.solo{border-radius:3px;border-right:1px solid #383838}
.${P}-ico{width:13px;height:13px;flex-shrink:0;color:#5b9cf6}
.${P}-main:hover .${P}-ico{color:#fff}
.${P}-qbtn{display:flex;align-items:center;padding:0 5px;background:#1e1e1e;color:#999;border:1px solid #383838;border-left:1px solid #2a2a2a;border-right:none;cursor:pointer;transition:background .12s,color .12s}
.${P}-qbtn:hover{background:#2a5cdb;color:#fff}
.${P}-x{display:flex;align-items:center;justify-content:center;width:24px;background:#1e1e1e;color:#777;border:1px solid #383838;border-left:1px solid #2a2a2a;border-radius:0 3px 3px 0;cursor:pointer;font-size:13px;line-height:1;transition:background .12s,color .12s}
.${P}-x:hover{background:#c0392b;color:#fff}
.${P}-x.solo{border-radius:3px;border-left:1px solid #383838}
.${P}-dd{position:absolute;top:calc(100% + 3px);right:0;min-width:190px;background:#1e1e1e;border:1px solid #383838;border-radius:4px;box-shadow:0 6px 24px rgba(0,0,0,.6);padding:3px 0;opacity:0;transform:translateY(-3px);transition:opacity .15s,transform .15s;pointer-events:none}
.${P}-dd.open{opacity:1;transform:translateY(0);pointer-events:auto}
.${P}-dd-hdr{padding:5px 9px 3px;font-size:9.5px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.05em}
.${P}-dd-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 9px;font-size:11px;color:#ccc;cursor:pointer;transition:background .1s}
.${P}-dd-item:hover{background:#2a5cdb;color:#fff}
.${P}-dd-lbl{font-weight:600}
.${P}-dd-meta{font-size:9.5px;color:#666}
.${P}-dd-item:hover .${P}-dd-meta{color:rgba(255,255,255,.7)}
`;
  document.documentElement.appendChild(s);
}

// ============================================================================
// SVG Icons
// ============================================================================

function icoDownload(): string {
  return `<svg class="${P}-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
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
  wrap: HTMLElement;
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
    ensureStyles();

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

    // Build: [↓ Download Video] [▾] [×]
    const wrap = document.createElement('div');
    wrap.className = P;

    // Main download button
    const main = document.createElement('button');
    main.className = `${P}-main` + (hasMulti ? '' : ' solo');
    main.innerHTML = `${icoDownload()}<span>Download Video</span>`;
    main.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.doDownload(media, variants, hasMulti ? undefined : 0);
    });
    wrap.appendChild(main);

    // Quality chevron (only if multiple variants)
    if (hasMulti) {
      const qbtn = document.createElement('button');
      qbtn.className = `${P}-qbtn`;
      qbtn.innerHTML = icoChevron();
      qbtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleDropdown(media.id, wrap, variants!);
      });
      wrap.appendChild(qbtn);
    }

    // Close button
    const x = document.createElement('button');
    x.className = `${P}-x` + (hasMulti ? '' : ' solo');
    x.textContent = '×';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      dismissed.add(media.id);
      this.removeOverlay(media.id);
    });
    wrap.appendChild(x);

    const overlay: Overlay = {
      media: variants ? { ...media, variants } : media,
      video,
      wrap,
      dropdown: null,
      rafId: null,
    };

    this.positionFixed(wrap, video);
    document.documentElement.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));

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
        this.positionFixed(o.wrap, o.video!);
        o.rafId = null;
      });
    }
  }

  private positionFixed(wrap: HTMLElement, video: HTMLVideoElement): void {
    const vr = video.getBoundingClientRect();
    if (vr.bottom < 0 || vr.top > window.innerHeight || vr.right < 0 || vr.left > window.innerWidth) {
      wrap.classList.add('hide');
      return;
    }
    wrap.classList.remove('hide');

    // Top-right of the video, 8px inset
    const top = vr.top + 8;
    const left = vr.right - 8;
    wrap.style.top = `${top}px`;
    wrap.style.left = `${left}px`;
    wrap.style.transform = `translateX(-100%)` + (wrap.classList.contains('show') ? '' : ' translateY(-4px)');
  }

  // ---------- Dropdown ----------

  private toggleDropdown(id: string, anchor: HTMLElement, variants: MediaVariant[]): void {
    const o = this.overlays.get(id);
    if (!o) return;
    if (o.dropdown) { this.closeDropdown(o); return; }

    const dd = document.createElement('div');
    dd.className = `${P}-dd`;

    const hdr = document.createElement('div');
    hdr.className = `${P}-dd-hdr`;
    hdr.textContent = 'Quality';
    dd.appendChild(hdr);

    variants.forEach((v, i) => {
      const item = document.createElement('div');
      item.className = `${P}-dd-item`;

      const lbl = document.createElement('span');
      lbl.className = `${P}-dd-lbl`;
      lbl.textContent = v.label;

      const meta = document.createElement('span');
      meta.className = `${P}-dd-meta`;
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

    const outside = (e: MouseEvent) => {
      if (!anchor.contains(e.target as Node)) {
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
    o.wrap.remove();
    o.dropdown?.remove();
    if (o.rafId) cancelAnimationFrame(o.rafId);
    if (o.video) o.video.removeAttribute(OVERLAY_ATTR);
  }
}
