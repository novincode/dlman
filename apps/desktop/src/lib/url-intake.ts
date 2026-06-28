// Central pipeline for URLs arriving from drops, pastes, or the browser
// extension. One place decides how links are extracted, cleaned, and routed to
// the right dialog — so behavior is identical no matter where the links came
// from (a dragged anchor, a dragged text selection, a paste, etc.).

import { toast } from 'sonner';
import i18n from '@/i18n';
import { useUIStore } from '@/stores/ui';
import { setPendingClipboardUrls, setPendingDropUrls } from '@/lib/events';
import { parseUrls } from '@/lib/utils';

// Substrings that show up in dragged HTML/text but are never downloadable
// (XML namespaces, schema declarations, etc.).
const JUNK_MARKERS = ['w3.org/', 'xmlns', 'schema.org'];

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/** De-dupe while preserving order and drop non-downloadable/junk URLs. */
export function cleanUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (!url || !isHttpUrl(url)) continue;
    if (JUNK_MARKERS.some((marker) => url.includes(marker))) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Extract every downloadable URL from a drag's DataTransfer.
 *
 * We merge ALL sources (uri-list + plain text + HTML anchors) instead of
 * stopping at the first that yields something. That's the key fix for the
 * "sometimes the dialog opens, sometimes it doesn't" bug: a selection can put
 * one incidental URL in text/plain while the real links live only in the anchor
 * hrefs of text/html — short-circuiting on text/plain would miss them entirely.
 */
export function extractUrlsFromDataTransfer(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const urls: string[] = [];

  // 1) text/uri-list — what browsers provide for a single dragged link.
  const uriList = dt.getData('text/uri-list');
  const uriListLines = uriList
    ? uriList
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    : [];
  urls.push(...uriListLines);

  // 2) text/plain — URLs that appear literally in dragged/selected text.
  const text = dt.getData('text/plain');
  if (text) {
    urls.push(...parseUrls(text));
  }

  // 3) text/html — anchor hrefs from a dragged selection or link. Always parsed
  //    and merged (not only as a fallback) so href-only links are never lost
  //    (e.g. a GitHub release list where the visible text is just filenames).
  const html = dt.getData('text/html');
  if (html) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const anchors = Array.from(doc.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href'))
        .filter((href): href is string => !!href);

      // Some sources (notably drags vs. copies) keep relative hrefs. Resolve
      // them against a best-effort base: an explicit <base>, a uri-list URL, or
      // the first absolute anchor in the fragment.
      const base =
        doc.querySelector('base[href]')?.getAttribute('href') ||
        uriListLines.find(isHttpUrl) ||
        anchors.find(isHttpUrl);

      for (const href of anchors) {
        if (isHttpUrl(href)) {
          urls.push(href);
        } else if (base) {
          try {
            urls.push(new URL(href, base).href);
          } catch {
            // unresolvable relative href — skip
          }
        }
      }
    } catch {
      // Malformed HTML — ignore, the other sources still apply.
    }
  }

  return cleanUrls(urls);
}

/**
 * Route a set of dropped URLs into the right dialog. Always gives feedback —
 * even an empty result toasts "no URLs found" rather than silently doing
 * nothing (the previous behavior that made drops feel broken).
 */
export function ingestDroppedUrls(rawUrls: string[]): void {
  const urls = cleanUrls(rawUrls);
  if (urls.length === 0) {
    toast.error(i18n.t('toasts.noUrlsFound'));
    return;
  }
  setPendingDropUrls(urls);
  useUIStore.getState().routeUrlIntake(urls.length);
}

/** Route URLs that came from a paste (clipboard channel). */
export function ingestPastedUrls(rawUrls: string[]): void {
  const urls = cleanUrls(rawUrls);
  if (urls.length === 0) return; // pastes are noisy; stay silent when nothing matches
  setPendingClipboardUrls(urls);
  useUIStore.getState().routeUrlIntake(urls.length);
}
