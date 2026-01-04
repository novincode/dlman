import type { ExtensionSettings } from '@/types';
import { storage } from 'wxt/storage';

// Storage keys
const SETTINGS_KEY = 'local:settings';

/**
 * Storage manager for extension settings using WXT storage API
 */
export const settingsStorage = {
  /**
   * Get all settings
   */
  async get(): Promise<ExtensionSettings> {
    const settings = await storage.getItem<ExtensionSettings>(SETTINGS_KEY);
    if (!settings) {
      // Return defaults
      const { DEFAULT_EXTENSION_SETTINGS } = await import('@/types');
      return { ...DEFAULT_EXTENSION_SETTINGS };
    }
    return settings;
  },

  /**
   * Save settings
   */
  async set(settings: ExtensionSettings): Promise<void> {
    await storage.setItem(SETTINGS_KEY, settings);
  },

  /**
   * Update partial settings
   */
  async update(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.get();
    const updated = { ...current, ...partial };
    await this.set(updated);
    return updated;
  },

  /**
   * Watch for setting changes
   */
  watch(callback: (settings: ExtensionSettings | null) => void): () => void {
    return storage.watch<ExtensionSettings>(SETTINGS_KEY, (newValue) => {
      callback(newValue);
    });
  },
};

/**
 * Quick access for disabled sites management
 */
export const disabledSitesStorage = {
  /**
   * Check if a hostname is disabled
   */
  async isDisabled(hostname: string): Promise<boolean> {
    const settings = await settingsStorage.get();
    const lowerHostname = hostname.toLowerCase();
    
    return settings.disabledSites.some(site => {
      const pattern = site.toLowerCase();
      if (pattern.startsWith('*.')) {
        const domain = pattern.slice(2);
        return lowerHostname === domain || lowerHostname.endsWith('.' + domain);
      }
      return lowerHostname === pattern;
    });
  },

  /**
   * Add a site to disabled list
   */
  async disable(hostname: string): Promise<void> {
    const settings = await settingsStorage.get();
    if (!settings.disabledSites.includes(hostname)) {
      settings.disabledSites.push(hostname);
      await settingsStorage.set(settings);
    }
  },

  /**
   * Remove a site from disabled list
   */
  async enable(hostname: string): Promise<void> {
    const settings = await settingsStorage.get();
    settings.disabledSites = settings.disabledSites.filter(
      site => site.toLowerCase() !== hostname.toLowerCase()
    );
    await settingsStorage.set(settings);
  },

  /**
   * Toggle a site's disabled state
   */
  async toggle(hostname: string): Promise<boolean> {
    const isDisabled = await this.isDisabled(hostname);
    if (isDisabled) {
      await this.enable(hostname);
      return false;
    } else {
      await this.disable(hostname);
      return true;
    }
  },
};
