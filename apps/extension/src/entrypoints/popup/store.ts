import { create } from 'zustand';
import type { Download, Queue, ExtensionSettings, DownloadProgressEvent } from '@/types';
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
  refresh: () => Promise<void>;
  setTab: (tab: 'downloads' | 'queues' | 'settings') => void;
  toggleEnabled: () => Promise<void>;
  toggleSite: () => Promise<void>;
  updateProgress: (event: DownloadProgressEvent) => void;
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

          // Check if site is disabled
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

      // Get connection status
      interface StatusResponse {
        enabled?: boolean;
        connected?: boolean;
        connectionStatus?: string;
      }
      const response = await browser.runtime.sendMessage({ type: 'get-status' }) as StatusResponse;
      set({ isConnected: response?.connected || false });

      // Fetch data if connected
      if (response?.connected) {
        await get().refresh();
      }
    } catch (error) {
      console.error('[DLMan] Failed to init popup:', error);
    } finally {
      set({ isConnecting: false });
    }
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

  updateProgress: (event) => {
    set((state) => ({
      activeDownloads: state.activeDownloads.map((d) =>
        d.id === event.id
          ? { 
              ...d, 
              downloaded: event.downloaded, 
              size: event.total || d.size,
              speed: event.speed,
            }
          : d
      ),
    }));
  },
}));
