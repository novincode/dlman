/**
 * Update notification store
 * 
 * Manages update availability state and allows dismissing the notification
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string | null;
  currentVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
}

interface UpdateStore {
  // Update info from last check
  updateInfo: UpdateInfo | null;
  
  // Whether the notification has been dismissed for this version
  dismissedVersion: string | null;
  
  // Loading state
  isChecking: boolean;
  
  // Actions
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setIsChecking: (checking: boolean) => void;
  dismissUpdate: () => void;
  
  // Computed - whether to show the notification
  shouldShowNotification: () => boolean;
}

export const useUpdateStore = create<UpdateStore>()(
  persist(
    (set, get) => ({
      updateInfo: null,
      dismissedVersion: null,
      isChecking: false,
      
      setUpdateInfo: (info) => set({ updateInfo: info }),
      setIsChecking: (checking) => set({ isChecking: checking }),
      
      dismissUpdate: () => {
        const { updateInfo } = get();
        if (updateInfo?.latestVersion) {
          set({ dismissedVersion: updateInfo.latestVersion });
        }
      },
      
      shouldShowNotification: () => {
        const { updateInfo, dismissedVersion } = get();
        if (!updateInfo?.hasUpdate || !updateInfo.latestVersion) {
          return false;
        }
        // Show if not dismissed or if a newer version was released
        return dismissedVersion !== updateInfo.latestVersion;
      },
    }),
    {
      name: 'dlman-update-store',
      partialize: (state) => ({
        // Only persist the dismissed version
        dismissedVersion: state.dismissedVersion,
      }),
    }
  )
);
