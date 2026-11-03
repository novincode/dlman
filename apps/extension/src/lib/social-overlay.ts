/**
 * IDM-style "Download this video" button for YouTube, Facebook and TikTok.
 *
 * These sites play through MediaSource (blob: URLs), so the generic detector
 * finds nothing useful. Instead the page link goes to DLMan desktop, which
 * resolves the real files (YouTube InnerTube player API, Facebook/TikTok page
 * JSON) and downloads the chosen quality — YouTube HD video + audio joined
 * with ffmpeg. The button reuses the generic overlay's look.
 */

import { shadowCSS, logoSvg, chevSvg, fmtSize } from './video-overlay';

const SOCIAL_HOSTS = /(^|\.)(youtube\.com|facebook\.com|tiktok\.com)$/i;

interface SocialFormat {
  id: string;
  label: string;
  size?: number | null;
}

type Resolved = { success: true; video: { site: string; title: string; formats: SocialFormat[] } } | { success: false; error: string };

export function isSocialSite(host: string): boolean {
  return SOCIAL_HOSTS.test(host);
}

/** The page link of the video currently on screen, or null (feed, channel, search). */
function currentVideoLink(video: HTMLVideoElement | null): string | null {
  const { hostname, pathname, href } = location;
  if (/youtube\.com$/i.test(hostname)) {
    if (pathname === '/watch' && new URLSearchParams(location.search).get('v')) {
      return `https://www.youtube.com/watch?v=${new URLSearchParams(location.search).get('v')}`;
    }
    const m = pathname.match(/^\/shorts\/([\w-]{11})/);
    return m ? `https://www.youtube.com/shorts/${m[1]}` : null;
  }
  if (/tiktok\.com$/i.test(hostname)) {
    if (/\/video\/\d{15,}/.test(pathname)) return href.split('?')[0];
    // Feed, For You, a profile's player popup: the URL isn't the video's, but its
    // player box is "xgwrapper-0-<video id>".
    const id = video?.closest('[id^="xgwrapper-"]')?.id.match(/(\d{15,})$/)?.[1];
    if (!id) return null;
    // The author's handle from the same post (TikTok serves "/@/video/<id>" less reliably).
    const post = video!.closest('article') ?? document;
    const handle = post.querySelector<HTMLAnchorElement>('a[href^="/@"]')?.getAttribute('href')?.match(/^\/@([\w.-]+)/)?.[1] ?? '';
    return `https://www.tiktok.com/@${handle}/video/${id}`;
  }
  if (/facebook\.com$/i.test(hostname)) {
    // ponytail: only pages that are one video (reel / watch / videos). Feed posts
    // with inline video get no button; right-click → Download with DLMan instead.
    if (/^\/(reel|reels)\/\d+/.test(pathname) || /\/videos\//.test(pathname)) return href.split('?')[0];
    const v = new URLSearchParams(location.search).get('v');
    return pathname.startsWith('/watch') && v ? `https://www.facebook.com/watch/?v=${v}` : null;
  }
  return null;
}

/** Where the picture is drawn inside a <video> (letterboxed unless object-fit says otherwise). */
function pictureRect(v: HTMLVideoElement): DOMRect {
  const r = v.getBoundingClientRect();
  const fit = getComputedStyle(v).objectFit;
  if (!v.videoWidth || !v.videoHeight || fit === 'cover' || fit === 'fill') return r;
  const k = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
  const w = v.videoWidth * k, h = v.videoHeight * k;
  return new DOMRect(r.left + (r.width - w) / 2, r.top + (r.height - h) / 2, w, h);
}

/** The biggest visible video on the page (the one being watched). */
function mainVideo(): HTMLVideoElement | null {
  let best: HTMLVideoElement | null = null;
  let area = 0;
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const a = r.width * r.height;
    if (visible && a > area && r.width > 200 && r.height > 120) {
      area = a;
      best = v;
    }
  }
  return best;
}

function send<T>(msg: object): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>;
}

export class SocialOverlay {
  private host: HTMLElement;
  private pill: HTMLElement;
  private label: HTMLElement;
  private dd: HTMLElement | null = null;
  private link: string | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: number;
  private onToast: (title: string, msg: string) => void;
  private outside = (e: MouseEvent) => {
    if (this.dd && !e.composedPath().includes(this.host)) this.close();
  };

  constructor(onToast: (title: string, msg: string) => void) {
    this.onToast = onToast;
    this.host = document.createElement('dlman-overlay');
    this.host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:none;pointer-events:none';
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = shadowCSS() + '.pill{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}.dd{max-height:60vh;overflow:auto}.pill.up .dd{top:auto;bottom:calc(100% + 6px)}.dd-msg{padding:8px 12px;font-size:11.5px;color:#bbb;max-width:280px;white-space:normal}';
    shadow.appendChild(style);

    this.pill = document.createElement('div');
    this.pill.className = 'pill show';
    this.pill.setAttribute('role', 'button');
    this.pill.setAttribute('tabindex', '0');
    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.innerHTML = logoSvg();
    this.label = document.createElement('span');
    this.label.textContent = 'Download this video';
    const chev = document.createElement('span');
    chev.innerHTML = chevSvg();
    this.pill.append(logo, this.label, chev);
    this.pill.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!e.composedPath().some((n) => n instanceof HTMLElement && n.classList.contains('dd'))) this.toggle();
    });
    this.pill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape') this.close();
    });
    shadow.appendChild(this.pill);
    document.documentElement.appendChild(this.host);

    document.addEventListener('click', this.outside, true);
    // SPA navigation (YouTube, TikTok, Facebook) never reloads: poll the URL + video.
    this.timer = window.setInterval(() => this.tick(), 700);
    this.tick();
  }

  private tick() {
    const video = mainVideo();
    const link = currentVideoLink(video);
    if (link !== this.link) {
      this.link = link;
      this.close();
    }
    this.video = link ? video : null;
    if (!this.video) {
      this.host.style.display = 'none';
      return;
    }
    // Outside the picture, lined up with its edge. YouTube: the player box (its
    // <video> is letterboxed inside). Elsewhere: the picture itself — TikTok's
    // <video> spans the whole feed column with the picture centred in it.
    const yt = this.video.closest('#movie_player, .html5-video-player') as HTMLElement | null;
    const r = yt ? yt.getBoundingClientRect() : pictureRect(this.video);
    this.host.style.display = 'block';
    const w = this.pill.offsetWidth, h = this.pill.offsetHeight, gap = 8;
    const fitsBelow = r.bottom + gap + h <= innerHeight - gap;
    const fitsRight = r.right + gap + w <= innerWidth - gap;
    let top: number, left: number;
    // Portrait (TikTok, reels): beside it, tops aligned. Landscape: below, right edges aligned.
    if (fitsRight && (r.height > r.width || !fitsBelow)) {
      top = Math.max(r.top, gap);
      left = r.right + gap;
    } else if (fitsBelow) {
      top = r.bottom + gap;
      left = r.right - w;
    } else {
      top = Math.max(r.top - gap - h, gap);
      left = r.right - w;
    }
    this.host.style.top = `${top}px`;
    this.host.style.left = `${Math.min(Math.max(left, gap), innerWidth - w - gap)}px`;
    this.host.style.right = 'auto';
    // The menu opens toward the roomier side of the window.
    this.pill.classList.toggle('up', top > innerHeight / 2);
  }

  private close() {
    this.dd?.remove();
    this.dd = null;
    this.pill.classList.remove('open');
  }

  private menu(): HTMLElement {
    this.close();
    const dd = document.createElement('div');
    dd.className = 'dd open';
    dd.setAttribute('role', 'menu');
    this.pill.appendChild(dd);
    this.pill.classList.add('open');
    // Never past the window edge: as tall as the room on the side it opens to.
    const pr = this.pill.getBoundingClientRect();
    const room = this.pill.classList.contains('up') ? pr.top : innerHeight - pr.bottom;
    dd.style.maxHeight = `${Math.max(room - 16, 120)}px`;
    this.dd = dd;
    return dd;
  }

  private message(text: string) {
    const m = document.createElement('div');
    m.className = 'dd-msg';
    m.textContent = text;
    this.menu().appendChild(m);
  }

  private async toggle() {
    if (this.dd) return this.close();
    const link = this.link;
    if (!link) return;
    this.message('Finding qualities…');
    let res: Resolved;
    try {
      res = await send<Resolved>({ type: 'social-resolve', url: link });
    } catch (e) {
      res = { success: false, error: String(e) };
    }
    if (this.link !== link || !this.dd) return; // navigated away / closed meanwhile
    if (!res.success) return this.message(res.error || 'DLMan is not running');

    const dd = this.menu();
    const hdr = document.createElement('div');
    hdr.className = 'dd-hdr';
    hdr.textContent = `${res.video.site} · select quality`;
    dd.appendChild(hdr);
    for (const f of res.video.formats) {
      const item = document.createElement('div');
      item.className = 'dd-item';
      item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '0');
      const lbl = document.createElement('span');
      lbl.className = 'dd-lbl';
      lbl.textContent = f.label;
      item.appendChild(lbl);
      if (f.size) {
        const meta = document.createElement('span');
        meta.className = 'dd-meta';
        meta.textContent = fmtSize(f.size);
        item.appendChild(meta);
      }
      const go = async (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        this.close();
        const r = await send<{ success: boolean; error?: string; filename?: string }>({
          type: 'social-download', url: link, format_id: f.id,
        }).catch((err): { success: boolean; error?: string; filename?: string } => ({ success: false, error: String(err) }));
        if (r.success) this.onToast('Sent to DLMan', r.filename || res.video.title);
        else this.onToast('DLMan could not download it', r.error || 'Unknown error');
      };
      item.addEventListener('click', go);
      item.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && go(e));
      dd.appendChild(item);
    }
    (dd.querySelector('.dd-item') as HTMLElement | null)?.focus();
  }

  destroy() {
    clearInterval(this.timer);
    document.removeEventListener('click', this.outside, true);
    this.host.remove();
  }
}
