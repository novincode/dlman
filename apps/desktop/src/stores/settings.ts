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
  defaultDownloadPath: getDefaultDownloadPath(),
  maxConcurrentDownloads: 4,
  defaultSegments: 4,
  globalSpeedLimit: null,
  theme: "system",
  devMode: false,
  minimizeToTray: true,
  startOnBoot: false,
  browserIntegrationPort: 7899,
  rememberLastPath: true,
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
      setDevMode: (devMode) =>
        set((state) => ({
          settings: { ...state.settings, devMode },
        })),
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      setDefaultDownloadPath: (path) =>
        set((state) => ({
          settings: { ...state.settings, defaultDownloadPath: path },
        })),
    }),
    {
      name: "dlman-settings",
    }
  )
);
