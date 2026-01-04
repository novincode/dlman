import { defineContentScript } from 'wxt/sandbox';

/**
 * Content script for detecting downloadable links on web pages
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  
  main() {
    console.log('[DLMan] Content script loaded');

    // Patterns for common downloadable file types
    const DOWNLOAD_PATTERNS = [
      // Archives
      /\.(zip|rar|7z|tar|gz|bz2|xz)$/i,
      // Executables
      /\.(exe|msi|dmg|pkg|deb|rpm|appimage)$/i,
      // Videos
      /\.(mp4|mkv|avi|mov|webm|m4v|flv|wmv)$/i,
      // Audio
      /\.(mp3|flac|wav|m4a|aac|ogg|wma)$/i,
      // Documents
      /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i,
      // Images (large)
      /\.(iso|img|bin)$/i,
      // Torrents
      /\.(torrent)$/i,
    ];

    /**
     * Check if a URL is potentially downloadable
     */
    function isDownloadableUrl(url: string): boolean {
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        return DOWNLOAD_PATTERNS.some(pattern => pattern.test(pathname));
      } catch {
        return false;
      }
    }

    /**
     * Extract file info from a URL
     */
    function extractFileInfo(url: string): { filename: string; extension: string } | null {
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const filename = decodeURIComponent(pathname.split('/').pop() || '');
        const extension = filename.split('.').pop()?.toLowerCase() || '';
        return { filename, extension };
      } catch {
        return null;
      }
    }

    /**
     * Get all downloadable links on the page
     */
    function getAllDownloadableLinks(): Array<{
      url: string;
      filename: string;
      text: string;
    }> {
      const links: Array<{ url: string; filename: string; text: string }> = [];
      const seenUrls = new Set<string>();

      document.querySelectorAll('a[href]').forEach((element) => {
        const anchor = element as HTMLAnchorElement;
        const href = anchor.href;

        if (!href || seenUrls.has(href)) return;

        if (isDownloadableUrl(href)) {
          seenUrls.add(href);
          const fileInfo = extractFileInfo(href);
          links.push({
            url: href,
            filename: fileInfo?.filename || href,
            text: anchor.textContent?.trim() || fileInfo?.filename || 'Download',
          });
        }
      });

      return links;
    }

    /**
     * Handle right-click on links to prepare context for context menu
     */
    function setupLinkClickHandler() {
      document.addEventListener('contextmenu', (event) => {
        const target = event.target as HTMLElement;
        const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
        
        if (anchor?.href) {
          // Store the link info for potential context menu action
          browser.storage.local.set({
            lastRightClickLink: {
              url: anchor.href,
              text: anchor.textContent?.trim() || '',
              referrer: window.location.href,
            },
          });
        }
      });
    }

    /**
     * Listen for messages from background script
     */
    interface Message {
      type: string;
      deepLink?: string;
    }

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as Message;
      
      switch (msg.type) {
        case 'get-all-links':
          const links = getAllDownloadableLinks();
          // Send links to background for batch download
          browser.runtime.sendMessage({
            type: 'all-links',
            links: links.map(l => l.url),
          });
          sendResponse({ count: links.length });
          return true;

        case 'get-page-info':
          sendResponse({
            title: document.title,
            url: window.location.href,
            hostname: window.location.hostname,
          });
          return true;

        case 'ping':
          sendResponse({ pong: true });
          return true;

        case 'open-deep-link':
          // Open a deep link URL to trigger the desktop app
          if (msg.deepLink) {
            try {
              // Create a hidden anchor and click it to trigger the protocol handler
              const link = document.createElement('a');
              link.href = msg.deepLink;
              link.style.display = 'none';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              sendResponse({ success: true });
            } catch (error) {
              console.error('[DLMan] Failed to open deep link:', error);
              sendResponse({ success: false, error: String(error) });
            }
          }
          return true;
          
        default:
          return true;
      }
    });

    // Initialize
    setupLinkClickHandler();
  },
});
