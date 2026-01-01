import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Theme, Settings } from "@/types";

interface SettingsState {
  // Settings as an object (for easy passing to dialogs)
  settings: Settings;

  // Actions
  setTheme: (theme: Theme) => void;
  setDevMode: (devMode: boolean) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  setDefaultDownloadPath: (path: string) => void;
}

const getDefaultDownloadPath = (): string => {
  // Use a placeholder that will be resolved when needed
  // The actual home directory will be resolved in components using @tauri-apps/api/path
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
  persist(
    (set) => ({
      // Settings object
      settings: defaultSettings,

      // Actions
      setTheme: (theme) =>
        set((state) => ({
          settings: { ...state.settings, theme },
        })),
      setDevMode: (dev_mode) =>
        set((state) => ({
          settings: { ...state.settings, dev_mode },
        })),
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      setDefaultDownloadPath: (path) =>
        set((state) => ({
          settings: { ...state.settings, default_download_path: path },
        })),
    }),
    {
      name: "dlman-settings",
    }
  )
);
