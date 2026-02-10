import { create } from 'zustand';
import type { Download, Queue, ExtensionSettings } from '@/types';
import type { WsEvent } from '@/lib/api-client';
import { getDlmanClient } from '@/lib/api-client';
import { settingsStorage } from '@/lib/storage';

interface PopupState {
  // Connection
  isConnected: boolean;
  isConnecting: boolean;
  
  // Data
  settings: ExtensionSettings | null;
  downloads: Download[];
  queues: Queue[];
  activeDownloads: Download[];
  
  // UI
  currentTab: 'downloads' | 'queues' | 'settings';
  currentHostname: string;
  isSiteDisabled: boolean;
  
  // Actions
  init: () => Promise<void>;
  cleanup: () => void;
  refresh: () => Promise<void>;
  retryConnection: () => Promise<void>;
  setTab: (tab: 'downloads' | 'queues' | 'settings') => void;
  toggleEnabled: () => Promise<void>;
  toggleSite: () => Promise<void>;
  updateFromWsEvent: (event: WsEvent) => void;
}

export const usePopupStore = create<PopupState>((set, get) => ({
  // Initial state
  isConnected: false,
  isConnecting: false,
  settings: null,
  downloads: [],
  queues: [],
  activeDownloads: [],
  currentTab: 'downloads',
  currentHostname: '',
  isSiteDisabled: false,

  init: async () => {
    set({ isConnecting: true });

    try {
      // Get settings
      const settings = await settingsStorage.get();
      set({ settings });

      // Get current tab hostname
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      if (currentTab?.url) {
        try {
          const hostname = new URL(currentTab.url).hostname;
          set({ currentHostname: hostname });

          const isDisabled = settings.disabledSites.some(site => {
            const pattern = site.toLowerCase();
            const lowerHostname = hostname.toLowerCase();
            if (pattern.startsWith('*.')) {
              const domain = pattern.slice(2);
              return lowerHostname === domain || lowerHostname.endsWith('.' + domain);
            }
            return lowerHostname === pattern;
          });
          set({ isSiteDisabled: isDisabled });
        } catch {
          // Invalid URL
        }
      }

      // Get connection status from background
      interface StatusResponse {
        enabled?: boolean;
        connected?: boolean;
        connectionStatus?: string;
      }
      let response = await browser.runtime.sendMessage({ type: 'get-status' }) as StatusResponse;

      // If not connected, try to connect automatically
      if (!response?.connected && settings.enabled) {
        console.log('[DLMan] Not connected, attempting auto-reconnect...');
        const connectResponse = await browser.runtime.sendMessage({ type: 'connect' }) as { connected?: boolean };
        response = { ...response, connected: connectResponse?.connected || false };
      }

      set({ isConnected: response?.connected || false });

      // Fetch data if connected
      if (response?.connected) {
        await get().refresh();
      }

      // Listen for background messages (progress, data changes)
      const messageListener = (message: unknown) => {
        const msg = message as { type: string; payload?: Record<string, unknown> };
        if (msg.type === 'download_progress' && msg.payload) {
          get().updateFromWsEvent({
            type: 'progress',
            id: msg.payload.id as string,
            downloaded: msg.payload.downloaded as number,
            total: msg.payload.total as number | null,
            speed: msg.payload.speed as number,
            eta: msg.payload.eta as number | null,
          });
        } else if (msg.type === 'data_changed') {
          // Something changed — refresh data
          get().refresh();
        }
      };
      browser.runtime.onMessage.addListener(messageListener);

      // Store cleanup function
      set({ cleanup: () => browser.runtime.onMessage.removeListener(messageListener) } as Partial<PopupState>);
    } catch (error) {
      console.error('[DLMan] Failed to init popup:', error);
    } finally {
      set({ isConnecting: false });
    }
  },

  cleanup: () => {
    // Will be replaced by init() with actual cleanup
  },

  refresh: async () => {
    const client = getDlmanClient();

    try {
      const [downloads, queues] = await Promise.all([
        client.getDownloads(),
        client.getQueues(),
      ]);

      const activeDownloads = downloads.filter(
        d => d.status === 'downloading' || d.status === 'pending'
      );

      set({ downloads, queues, activeDownloads });
    } catch (error) {
      console.error('[DLMan] Failed to refresh data:', error);
    }
  },

  retryConnection: async () => {
    set({ isConnecting: true });
    
    try {
      const response = await browser.runtime.sendMessage({ type: 'connect' }) as { connected?: boolean };
      const isConnected = response?.connected || false;
      set({ isConnected });
      
      // Fetch data if connected
      if (isConnected) {
        await get().refresh();
      }
    } catch (error) {
      console.error('[DLMan] Failed to retry connection:', error);
      set({ isConnected: false });
    } finally {
      set({ isConnecting: false });
    }
  },

  setTab: (tab) => set({ currentTab: tab }),

  toggleEnabled: async () => {
    const { settings } = get();
    if (!settings) return;

    const newSettings = { ...settings, enabled: !settings.enabled };
    await settingsStorage.set(newSettings);
    set({ settings: newSettings });

    // Notify background
    browser.runtime.sendMessage({
      type: settings.enabled ? 'disable' : 'enable',
    });
  },

  toggleSite: async () => {
    const { currentHostname, isSiteDisabled, settings } = get();
    if (!currentHostname || !settings) return;

    let disabledSites = [...settings.disabledSites];
    
    if (isSiteDisabled) {
      // Enable - remove from list
      disabledSites = disabledSites.filter(
        site => site.toLowerCase() !== currentHostname.toLowerCase()
      );
    } else {
      // Disable - add to list
      disabledSites.push(currentHostname);
    }

    const newSettings = { ...settings, disabledSites };
    await settingsStorage.set(newSettings);
    set({ settings: newSettings, isSiteDisabled: !isSiteDisabled });
  },

  updateFromWsEvent: (event) => {
    if (event.type === 'progress' && event.id) {
      set((state) => ({
        activeDownloads: state.activeDownloads.map((d) =>
          d.id === event.id
            ? {
                ...d,
                downloaded: event.downloaded ?? d.downloaded,
                size: event.total ?? d.size,
                speed: event.speed ?? d.speed,
              }
            : d
        ),
      }));
    }
  },
}));
