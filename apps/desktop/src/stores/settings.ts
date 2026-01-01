import { create } from "zustand";
import type { Theme, Settings } from "@/types";

interface SettingsState {
  // Settings as an object (for easy passing to dialogs)
  settings: Settings;
  // Whether settings have been loaded from backend
  loaded: boolean;

  // Actions
  setTheme: (theme: Theme) => void;
  setDevMode: (devMode: boolean) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  setDefaultDownloadPath: (path: string) => void;
  // Load settings from backend (SQLite - single source of truth)
  loadFromBackend: () => Promise<void>;
  // Save current settings to backend
  saveToBackend: () => Promise<void>;
}

const getDefaultDownloadPath = (): string => {
  return '~/Downloads/dlman';
};

const defaultSettings: Settings = {
  default_download_path: getDefaultDownloadPath(),
  max_concurrent_downloads: 4,
  default_segments: 4,
  global_speed_limit: null,
  theme: "system",
  dev_mode: false,
  minimize_to_tray: true,
  start_on_boot: false,
  browser_integration_port: 7899,
  remember_last_path: true,
  max_retries: 5,
  retry_delay_seconds: 30,
};

export const useSettingsStore = create<SettingsState>()(
  (set, get) => ({
    // Settings object
    settings: defaultSettings,
    loaded: false,

    // Actions
    setTheme: (theme) => {
      set((state) => ({
        settings: { ...state.settings, theme },
      }));
      // Auto-save to backend
      get().saveToBackend();
    },
    setDevMode: (dev_mode) => {
      set((state) => ({
        settings: { ...state.settings, dev_mode },
      }));
      // Auto-save to backend
      get().saveToBackend();
    },
    updateSettings: (newSettings) => {
      set((state) => ({
        settings: { ...state.settings, ...newSettings },
      }));
      // Auto-save to backend
      get().saveToBackend();
    },
    setDefaultDownloadPath: (path) => {
      set((state) => ({
        settings: { ...state.settings, default_download_path: path },
      }));
      // Auto-save to backend
      get().saveToBackend();
    },
    
    // Load settings from backend SQLite (single source of truth)
    loadFromBackend: async () => {
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
      if (!isTauri) {
        console.log('[Settings] Not in Tauri context, using defaults');
        set({ loaded: true });
        return;
      }
      
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const backendSettings = await invoke<Settings>('get_settings');
        console.log('[Settings] Loaded from SQLite:', backendSettings);
        console.log('[Settings] default_segments:', backendSettings.default_segments);
        set({ settings: backendSettings, loaded: true });
      } catch (err) {
        console.error('[Settings] Failed to load settings from backend:', err);
        set({ loaded: true }); // Still mark as loaded with defaults
      }
    },
    
    // Save settings to backend SQLite
    saveToBackend: async () => {
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
      if (!isTauri) {
        return;
      }
      
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const settings = get().settings;
        console.log('[Settings] Saving to SQLite:', settings);
        await invoke('update_settings', { settings });
        console.log('[Settings] Saved to backend successfully');
      } catch (err) {
        console.error('[Settings] Failed to save settings to backend:', err);
      }
    },
  })
);

/**
 * Load settings from backend SQLite on app startup.
 * SQLite is the SINGLE SOURCE OF TRUTH for settings.
 * Call this once when the app starts.
 */
export async function loadSettingsFromBackend(): Promise<void> {
  console.log('[Settings] loadSettingsFromBackend called');
  await useSettingsStore.getState().loadFromBackend();
}