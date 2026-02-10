import { defineBackground } from 'wxt/sandbox';
import { getDlmanClient, resetDlmanClient } from '@/lib/api-client';
import type { WsEvent } from '@/lib/api-client';
import { settingsStorage, disabledSitesStorage } from '@/lib/storage';
import { isDownloadableUrl, extractFilename } from '@/lib/utils';
import type { ExtensionSettings } from '@/types';

export default defineBackground(() => {
  console.log('[DLMan] Background service worker started');

  // Compat shim: browser.action (MV3) vs browser.browserAction (Firefox MV2)
  const actionApi = browser.action ?? (browser as any).browserAction;

  let currentSettings: ExtensionSettings | null = null;
  let connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';

  // Name for the periodic reconnection alarm
  const RECONNECT_ALARM = 'dlman-reconnect';

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

    // Set up periodic reconnection via alarms API
    setupReconnectAlarm();

    // Try to connect to DLMan
    await connectToDlman();

    // Set up download interception
    setupDownloadInterception();

    // Update badge
    updateBadge();
  }

  // ============================================================================
  // Periodic reconnection via browser.alarms
  // ============================================================================

  function setupReconnectAlarm() {
    // Create alarm that fires every 30 seconds
    browser.alarms.create(RECONNECT_ALARM, { periodInMinutes: 0.5 });

    browser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name !== RECONNECT_ALARM) return;

      // Only reconnect if enabled and currently disconnected
      if (!currentSettings?.enabled || connectionStatus === 'connected') return;

      console.log('[DLMan] Alarm: attempting reconnection...');
      await connectToDlman();
    });
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
      onEvent: (event: WsEvent) => {
        // Broadcast real-time events to popup if open
        if (event.type === 'progress' && event.id) {
          browser.runtime.sendMessage({
            type: 'download_progress',
            payload: {
              id: event.id,
              downloaded: event.downloaded ?? 0,
              total: event.total ?? null,
              speed: event.speed ?? 0,
              eta: event.eta ?? null,
            },
          }).catch(() => {
            // Popup not open, ignore
          });
        } else if (event.type === 'status_changed' || event.type === 'download_added') {
          // Tell popup to refresh its data
          browser.runtime.sendMessage({
            type: 'data_changed',
          }).catch(() => {});
        }
      },
      onError: (error: string) => {
        console.error('[DLMan] Server error:', error);
      },
    });

    // First check if the app is even running
    const isRunning = await client.ping();
    if (!isRunning) {
      connectionStatus = 'disconnected';
      updateBadge();
      console.log('[DLMan] Desktop app not running');
      return;
    }

    // App is running — try to open WebSocket for real-time events
    const wsConnected = await client.connect();
    if (wsConnected) {
      connectionStatus = 'connected';
    } else {
      // WS failed but HTTP ping works — mark as connected (HTTP-only mode)
      connectionStatus = 'connected';
      console.log('[DLMan] Connected via HTTP only (WebSocket unavailable)');
    }
    updateBadge();
  }

  // ============================================================================
  // Context Menu
  // ============================================================================

  async function setupContextMenus() {
    await browser.contextMenus.removeAll();

    browser.contextMenus.create({
      id: 'download-with-dlman',
      title: 'Download with DLMan',
      contexts: ['link', 'video', 'audio', 'image'],
    });

    browser.contextMenus.create({
      id: 'download-all-links',
      title: 'Download all links with DLMan',
      contexts: ['page'],
    });

    browser.contextMenus.create({
      id: 'separator-1',
      type: 'separator',
      contexts: ['page', 'link'],
    });

    browser.contextMenus.create({
      id: 'toggle-site',
      title: 'Disable DLMan on this site',
      contexts: ['page', 'link'],
    });
  }

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
          browser.tabs.sendMessage(tab.id, { type: 'get-all-links' });
        }
        break;

      case 'toggle-site':
        if (tab?.url) {
          try {
            const hostname = new URL(tab.url).hostname;
            const isNowDisabled = await disabledSitesStorage.toggle(hostname);

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

  const DOWNLOADABLE_MIME_TYPES = [
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',
    'application/octet-stream',
    'application/x-msdownload',
    'application/x-msi',
    'application/x-apple-diskimage',
    'application/x-iso9660-image',
    'video/mp4',
    'video/x-matroska',
    'video/x-msvideo',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/flac',
    'audio/wav',
    'audio/mp4',
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
    return DOWNLOADABLE_MIME_TYPES.some(
      (mime) => lowerMime === mime || lowerMime.startsWith(mime + ';'),
    );
  }

  function setupDownloadInterception() {
    browser.downloads.onCreated.addListener(async (downloadItem) => {
      if (!currentSettings?.enabled || !currentSettings?.autoIntercept) {
        return;
      }

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
        if (isDisabled) return;
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
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icon/128.png',
          title: 'DLMan Not Running',
          message: 'Start DLMan to intercept downloads',
        });
        return;
      }

      // Cancel browser download and hand off to DLMan
      try {
        await browser.downloads.cancel(downloadItem.id);
        await browser.downloads.erase({ id: downloadItem.id });
      } catch (error) {
        console.error('[DLMan] Failed to cancel browser download:', error);
      }

      await handleDownload(url, downloadItem.referrer, downloadItem.filename);
    });
  }

  // ============================================================================
  // Download Handler — direct HTTP POST, no deep links
  // ============================================================================

  async function handleDownload(url: string, referrer?: string, suggestedFilename?: string) {
    const client = getDlmanClient();

    // Check if DLMan is available
    const isAvailable = await client.ping();
    if (!isAvailable) {
      if (currentSettings?.fallbackToBrowser) {
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

    // Add download directly via HTTP POST
    const result = await client.addDownload({
      url,
      filename: suggestedFilename || extractFilename(url),
      referrer,
      queue_id: currentSettings?.defaultQueueId || undefined,
    });

    if (result.success) {
      if (currentSettings?.showNotifications) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icon/128.png',
          title: 'Download Added',
          message: result.download?.filename || extractFilename(url),
        });
      }
    } else {
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon/128.png',
        title: 'Download Failed',
        message: result.error || 'Failed to add download',
      });
    }
  }

  // ============================================================================
  // Badge Management
  // ============================================================================

  function updateBadge() {
    if (!actionApi) return; // Safety: no badge API available

    if (!currentSettings?.enabled) {
      actionApi.setBadgeText({ text: 'OFF' });
      actionApi.setBadgeBackgroundColor({ color: '#6b7280' });
      return;
    }

    switch (connectionStatus) {
      case 'connected':
        actionApi.setBadgeText({ text: '' });
        break;
      case 'connecting':
        actionApi.setBadgeText({ text: '...' });
        actionApi.setBadgeBackgroundColor({ color: '#f59e0b' });
        break;
      case 'disconnected':
        actionApi.setBadgeText({ text: '!' });
        actionApi.setBadgeBackgroundColor({ color: '#ef4444' });
        break;
    }
  }

  // ============================================================================
  // Message Handling (from popup, content scripts)
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
        (async () => {
          const client = getDlmanClient({
            port: currentSettings?.port || 7899,
          });
          const isAvailable = await client.ping();

          // Sync connection status based on actual reachability
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
              download: result.download,
            });

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
          await connectToDlman();
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
