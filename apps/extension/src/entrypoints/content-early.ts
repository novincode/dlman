import { defineContentScript } from 'wxt/sandbox';

/**
 * Early-injection content script (document_start).
 *
 * Injects the MAIN-world media hook script before any page JavaScript runs.
 * This ensures we intercept fetch/XHR/MSE calls from the very beginning.
 *
 * The actual hook logic lives in /media-hook.js (built from src/lib/media-hook.ts).
 * This script simply injects it into the page's MAIN world via a <script> tag.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  
  main() {
    try {
      const script = document.createElement('script');
      script.src = browser.runtime.getURL('/media-hook.js');
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch {
      // Silently fail — some pages may block script injection (CSP)
    }
  },
});
