import { defineBackground } from 'wxt/sandbox';
import { getDlmanClient, resetDlmanClient } from '@/lib/api-client';
import { settingsStorage, disabledSitesStorage } from '@/lib/storage';
import { isDownloadableUrl, extractFilename } from '@/lib/utils';
import type { ExtensionSettings } from '@/types';

export default defineBackground(() => {
  console.log('[DLMan] Background service worker started');

  let currentSettings: ExtensionSettings | null = null;
  let connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';

  // ============================================================================
  // Initialization
  // ============================================================================

  async function init() {
    // Load settings
    currentSettings = await settingsStorage.get();
    console.log('[DLMan] Settings loaded:', currentSettings);

    // Set up context menus
    await setupContextMenus();

    // Watch for setting changes
    settingsStorage.watch((settings) => {
      if (settings) {
        const portChanged = currentSettings?.port !== settings.port;
        currentSettings = settings;
        
        // Reconnect if port changed
        if (portChanged) {
          resetDlmanClient();
          connectToDlman();
        }
        
        updateBadge();
      }
    });

    // Try to connect to DLMan
    await connectToDlman();

    // Set up download interception
    setupDownloadInterception();

    // Update badge
    updateBadge();
  }

  // ============================================================================
  // DLMan Connection
  // ============================================================================

  async function connectToDlman() {
    if (!currentSettings?.enabled) {
      connectionStatus = 'disconnected';
      updateBadge();
      return;
    }

    connectionStatus = 'connecting';
    updateBadge();

    const client = getDlmanClient({
      port: currentSettings.port,
      onConnect: () => {
        connectionStatus = 'connected';
        updateBadge();
        console.log('[DLMan] Connected to desktop app');
      },
      onDisconnect: () => {
        connectionStatus = 'disconnected';
        updateBadge();
        console.log('[DLMan] Disconnected from desktop app');
      },
      onProgress: (event) => {
        // Broadcast progress to popup if open
        browser.runtime.sendMessage({
          type: 'download_progress',
          payload: event,
        }).catch(() => {
          // Popup not open, ignore
        });
      },
    });

    const connected = await client.connect();
    if (!connected) {
      connectionStatus = 'disconnected';
      updateBadge();
      console.log('[DLMan] Failed to connect to desktop app');
    }
  }

  // ============================================================================
  // Context Menu
  // ============================================================================

  async function setupContextMenus() {
    // Remove existing menus
    await browser.contextMenus.removeAll();

    // Download with DLMan
    browser.contextMenus.create({
      id: 'download-with-dlman',
      title: 'Download with DLMan',
      contexts: ['link', 'video', 'audio', 'image'],
    });

    // Download all links
    browser.contextMenus.create({
      id: 'download-all-links',
      title: 'Download all links with DLMan',
      contexts: ['page'],
    });

    // Separator
    browser.contextMenus.create({
      id: 'separator-1',
      type: 'separator',
      contexts: ['page', 'link'],
    });

    // Toggle for current site
    browser.contextMenus.create({
      id: 'toggle-site',
      title: 'Disable DLMan on this site',
      contexts: ['page', 'link'],
    });
  }

  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    switch (info.menuItemId) {
      case 'download-with-dlman':
        if (info.linkUrl) {
          await handleDownload(info.linkUrl, tab?.url);
        } else if (info.srcUrl) {
          await handleDownload(info.srcUrl, tab?.url);
        }
        break;

      case 'download-all-links':
        if (tab?.id) {
          // Send message to content script to get all links
          browser.tabs.sendMessage(tab.id, { type: 'get-all-links' });
        }
        break;

      case 'toggle-site':
        if (tab?.url) {
          try {
            const hostname = new URL(tab.url).hostname;
            const isNowDisabled = await disabledSitesStorage.toggle(hostname);
            
            // Show notification
            if (currentSettings?.showNotifications) {
              browser.notifications.create({
                type: 'basic',
                iconUrl: 'icon/128.png',
                title: 'DLMan',
                message: isNowDisabled
                  ? `Disabled on ${hostname}`
                  : `Enabled on ${hostname}`,
              });
            }
          } catch (error) {
            console.error('[DLMan] Failed to toggle site:', error);
          }
        }
        break;
    }
  });

  // ============================================================================
  // Download Interception
  // ============================================================================

  // MIME types that should be intercepted
  const DOWNLOADABLE_MIME_TYPES = [
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',
    'application/octet-stream', // Generic binary
    'application/x-msdownload', // Windows executables
    'application/x-msi',
    'application/x-apple-diskimage',
    'application/x-iso9660-image',
    'video/mp4',
    'video/x-matroska', // MKV
    'video/x-msvideo', // AVI
    'video/quicktime', // MOV
    'video/webm',
    'audio/mpeg', // MP3
    'audio/flac',
    'audio/wav',
    'audio/mp4', // M4A
    'audio/aac',
    'audio/ogg',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];

  function isDownloadableMimeType(mimeType: string | undefined): boolean {
    if (!mimeType) return false;
    const lowerMime = mimeType.toLowerCase().split(';')[0].trim();
    return DOWNLOADABLE_MIME_TYPES.some(mime => lowerMime === mime || lowerMime.startsWith(mime + ';'));
  }

  function setupDownloadInterception() {
    // Intercept browser downloads
    browser.downloads.onCreated.addListener(async (downloadItem) => {
      if (!currentSettings?.enabled || !currentSettings?.autoIntercept) {
        return;
      }

      // Check if URL matches patterns OR MIME type is downloadable
      const url = downloadItem.url;
      const matchesPattern = url && isDownloadableUrl(url, currentSettings.interceptPatterns);
      const matchesMimeType = isDownloadableMimeType(downloadItem.mime);
      
      if (!url || (!matchesPattern && !matchesMimeType)) {
        return;
      }

      // Check if site is disabled
      try {
        const hostname = new URL(downloadItem.referrer || url).hostname;
        const isDisabled = await disabledSitesStorage.isDisabled(hostname);
        if (isDisabled) {
          return;
        }
      } catch {
        // Invalid URL, skip
      }

      // Check if DLMan is available
      const client = getDlmanClient();
      const isAvailable = await client.ping();

      if (!isAvailable) {
        if (currentSettings.fallbackToBrowser) {
          console.log('[DLMan] App not running, using browser download');
          return;
        }
        // Show notification that DLMan is not running
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icon/128.png',
          title: 'DLMan Not Running',
          message: 'Start DLMan to intercept downloads',
        });
        return;
      }

      // Cancel browser download
      try {
        await browser.downloads.cancel(downloadItem.id);
        await browser.downloads.erase({ id: downloadItem.id });
      } catch (error) {
        console.error('[DLMan] Failed to cancel browser download:', error);
      }

      // Send to DLMan
      await handleDownload(url, downloadItem.referrer, downloadItem.filename);
    });
  }

  // ============================================================================
  // Download Handler
  // ============================================================================

  async function handleDownload(url: string, referrer?: string, suggestedFilename?: string) {
    const client = getDlmanClient();

    // Check if DLMan is available
    const isAvailable = await client.ping();
    if (!isAvailable) {
      if (currentSettings?.fallbackToBrowser) {
        // Fallback to browser download
        browser.downloads.download({ url });
        return;
      }

      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon/128.png',
        title: 'DLMan Not Running',
        message: 'Please start DLMan to download files',
      });
      return;
    }

    // Show the download dialog in the app instead of adding directly
    const dialogResult = await client.showDownloadDialog(
      url,
      referrer,
      suggestedFilename || extractFilename(url)
    );

    if (dialogResult.success && dialogResult.deepLink) {
      // Open the deep link to show the dialog
      try {
        // Use browser extension API to open the deep link
        // This will trigger the desktop app to open its New Download dialog
        await openDeepLink(dialogResult.deepLink);
        
        if (currentSettings?.showNotifications) {
          browser.notifications.create({
            type: 'basic',
            iconUrl: 'icon/128.png',
            title: 'Download Dialog Opened',
            message: 'Configure your download in DLMan',
          });
        }
      } catch (error) {
        console.error('[DLMan] Failed to open deep link:', error);
        // Fallback: try to add directly
        const result = await client.addDownload({
          url,
          filename: suggestedFilename || extractFilename(url),
          referrer,
          queue_id: currentSettings?.defaultQueueId || undefined,
        });
        
        if (result.success && currentSettings?.showNotifications) {
          browser.notifications.create({
            type: 'basic',
            iconUrl: 'icon/128.png',
            title: 'Download Added',
            message: result.download?.filename || extractFilename(url),
          });
        }
      }
    } else {
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon/128.png',
        title: 'Download Failed',
        message: dialogResult.error || 'Unknown error',
      });
    }
  }

  /**
   * Open a deep link URL to trigger the desktop app
   */
  async function openDeepLink(deepLink: string) {
    // Try to open the deep link using browser APIs
    try {
      // Create a temporary anchor to trigger the protocol handler
      // Note: This works through the content script
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        await browser.tabs.sendMessage(tabs[0].id, {
          type: 'open-deep-link',
          deepLink,
        });
      }
    } catch (error) {
      // If content script isn't available, try direct approach
      // This might work on some browsers
      console.log('[DLMan] Attempting direct deep link open:', deepLink);
    }
  }

  // ============================================================================
  // Badge Management
  // ============================================================================

  function updateBadge() {
    if (!currentSettings?.enabled) {
      browser.action.setBadgeText({ text: 'OFF' });
      browser.action.setBadgeBackgroundColor({ color: '#6b7280' });
      return;
    }

    switch (connectionStatus) {
      case 'connected':
        browser.action.setBadgeText({ text: '' });
        break;
      case 'connecting':
        browser.action.setBadgeText({ text: '...' });
        browser.action.setBadgeBackgroundColor({ color: '#f59e0b' });
        break;
      case 'disconnected':
        browser.action.setBadgeText({ text: '!' });
        browser.action.setBadgeBackgroundColor({ color: '#ef4444' });
        break;
    }
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  interface Message {
    type: string;
    url?: string;
    referrer?: string;
    links?: string[];
  }

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const msg = message as Message;
    
    switch (msg.type) {
      case 'get-status':
        // Quick ping to verify actual connection status
        (async () => {
          const client = getDlmanClient({
            port: currentSettings?.port || 7899,
          });
          const isAvailable = await client.ping();
          
          // Update status based on actual ping result
          if (isAvailable && connectionStatus !== 'connected') {
            connectionStatus = 'connected';
            updateBadge();
          } else if (!isAvailable && connectionStatus === 'connected') {
            connectionStatus = 'disconnected';
            updateBadge();
          }
          
          sendResponse({
            enabled: currentSettings?.enabled,
            connected: isAvailable,
            connectionStatus: isAvailable ? 'connected' : connectionStatus,
          });
        })();
        return true;

      case 'add-download':
        (async () => {
          try {
            const client = getDlmanClient();
            const isAvailable = await client.ping();
            
            if (!isAvailable) {
              sendResponse({ success: false, error: 'DLMan is not running' });
              return;
            }
            
            const result = await client.addDownload({
              url: msg.url || '',
              referrer: msg.referrer,
              queue_id: currentSettings?.defaultQueueId || undefined,
            });
            
            sendResponse({ 
              success: result.success, 
              error: result.error,
              download: result.download 
            });
            
            // Show notification if enabled
            if (result.success && currentSettings?.showNotifications) {
              browser.notifications.create({
                type: 'basic',
                iconUrl: 'icon/128.png',
                title: 'Download Added',
                message: result.download?.filename || extractFilename(msg.url || ''),
              });
            }
          } catch (error) {
            sendResponse({ success: false, error: (error as Error).message });
          }
        })();
        return true;

      case 'connect':
        (async () => {
          // First try to ping directly to check if app is running
          const client = getDlmanClient({
            port: currentSettings?.port || 7899,
          });
          
          const isAvailable = await client.ping();
          
          if (isAvailable) {
            // App is running, try WebSocket connection
            const connected = await client.connect();
            if (connected) {
              connectionStatus = 'connected';
              updateBadge();
            } else {
              // WebSocket failed but ping works, still mark as connected for HTTP fallback
              connectionStatus = 'connected';
              updateBadge();
            }
          } else {
            connectionStatus = 'disconnected';
            updateBadge();
          }
          
          sendResponse({ connected: connectionStatus === 'connected' });
        })();
        return true;

      case 'all-links':
        // Handle links from content script
        if (msg.links && Array.isArray(msg.links)) {
          msg.links.forEach((url: string) => {
            handleDownload(url, sender.tab?.url);
          });
        }
        return true;
        
      default:
        return true;
    }
  });

  // Initialize
  init();
});
