import { defineContentScript } from 'wxt/sandbox';

/**
 * Content script for detecting downloadable links on web pages
 * and showing modern toast notifications when downloads are sent to DLMan.
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
     * Get all <a href> links within the current text selection.
     * Returns unique, absolute URLs from any anchor elements that
     * are fully or partially inside the selection range.
     */
    function getSelectedLinks(): string[] {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return [];
      }

      const urls = new Set<string>();

      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        const container = range.commonAncestorContainer;

        // If the container itself is an element, search within it
        const root = container.nodeType === Node.ELEMENT_NODE
          ? container as Element
          : container.parentElement;

        if (!root) continue;

        // Find all anchors inside the common ancestor
        const anchors = root.querySelectorAll('a[href]');
        anchors.forEach((el) => {
          const anchor = el as HTMLAnchorElement;
          // Check if the anchor intersects with the selection range
          if (selection.containsNode(anchor, true) && anchor.href) {
            try {
              // Validate it's a proper http(s) URL
              const url = new URL(anchor.href);
              if (url.protocol === 'http:' || url.protocol === 'https:') {
                urls.add(anchor.href);
              }
            } catch {
              // Invalid URL, skip
            }
          }
        });

        // Also check: if the selection contains raw text that looks like URLs
        const selectedText = selection.toString();
        const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
        let match;
        while ((match = urlRegex.exec(selectedText)) !== null) {
          try {
            const url = new URL(match[0]);
            if (url.protocol === 'http:' || url.protocol === 'https:') {
              urls.add(match[0]);
            }
          } catch {
            // Invalid URL fragment, skip
          }
        }
      }

      return Array.from(urls);
    }

    // ========================================================================
    // In-page Toast Notification
    // ========================================================================

    /** CSS keyframes + styles injected once */
    let toastStyleInjected = false;
    let toastContainer: HTMLDivElement | null = null;

    function ensureToastInfra() {
      if (toastStyleInjected) return;
      toastStyleInjected = true;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes dlman-slide-in {
          from { transform: translateX(calc(100% + 16px)); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes dlman-slide-out {
          from { transform: translateX(0); opacity: 1; }
          to   { transform: translateX(calc(100% + 16px)); opacity: 0; }
        }
        #dlman-toast-container {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          gap: 8px;
          pointer-events: none;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        }
        .dlman-toast {
          pointer-events: auto;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 10px;
          background: linear-gradient(135deg, #1e3a5f 0%, #0f1f36 100%);
          color: #e2e8f0;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.4;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.25);
          animation: dlman-slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          max-width: 340px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .dlman-toast.dlman-toast-exit {
          animation: dlman-slide-out 0.3s cubic-bezier(0.55, 0, 1, 0.45) forwards;
        }
        .dlman-toast-icon {
          flex-shrink: 0;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.35);
        }
        .dlman-toast-icon svg {
          width: 16px;
          height: 16px;
          color: white;
        }
        .dlman-toast-body {
          flex: 1;
          min-width: 0;
        }
        .dlman-toast-title {
          font-weight: 600;
          font-size: 13px;
          color: #f1f5f9;
          margin-bottom: 1px;
        }
        .dlman-toast-message {
          font-size: 12px;
          color: #94a3b8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dlman-toast-accent {
          color: #60a5fa;
          font-weight: 600;
        }
      `;
      document.documentElement.appendChild(style);

      toastContainer = document.createElement('div');
      toastContainer.id = 'dlman-toast-container';
      document.documentElement.appendChild(toastContainer);
    }

    /**
     * Show a DLMan-branded toast notification in the page.
     * @param count Number of links sent
     */
    function showDlmanToast(count: number) {
      ensureToastInfra();
      if (!toastContainer) return;

      const toast = document.createElement('div');
      toast.className = 'dlman-toast';

      const noun = count === 1 ? 'link' : 'links';

      // Build toast DOM safely (no innerHTML) to pass Firefox addon validation
      const iconDiv = document.createElement('div');
      iconDiv.className = 'dlman-toast-icon';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2.5');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4');
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', '7 10 12 15 17 10');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '12'); line.setAttribute('y1', '15');
      line.setAttribute('x2', '12'); line.setAttribute('y2', '3');
      svg.append(path, polyline, line);
      iconDiv.appendChild(svg);

      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'dlman-toast-body';
      const titleDiv = document.createElement('div');
      titleDiv.className = 'dlman-toast-title';
      titleDiv.textContent = 'Sent to DLMan';
      const msgDiv = document.createElement('div');
      msgDiv.className = 'dlman-toast-message';
      const accentSpan = document.createElement('span');
      accentSpan.className = 'dlman-toast-accent';
      accentSpan.textContent = String(count);
      msgDiv.append(accentSpan, ` ${noun} sent to download manager`);
      bodyDiv.append(titleDiv, msgDiv);

      toast.append(iconDiv, bodyDiv);

      toastContainer.appendChild(toast);

      // Auto-dismiss after 3.5 seconds
      setTimeout(() => {
        toast.classList.add('dlman-toast-exit');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
      }, 3500);
    }

    // ========================================================================
    // Link click handler & message handling
    // ========================================================================

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
    }

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as Message;
      
      switch (msg.type) {
        case 'get-all-links': {
          const links = getAllDownloadableLinks();
          // Send links to background for batch download
          browser.runtime.sendMessage({
            type: 'all-links',
            links: links.map(l => l.url),
          });
          sendResponse({ count: links.length });
          return true;
        }

        case 'get-selected-links': {
          const selectedLinks = getSelectedLinks();
          sendResponse({ links: selectedLinks });
          return true;
        }

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

        case 'show-toast': {
          const toastMsg = message as Message & { count?: number };
          showDlmanToast(toastMsg.count || 1);
          sendResponse({ ok: true });
          return true;
        }
          
        default:
          return true;
      }
    });

    // Initialize
    setupLinkClickHandler();
  },
});
