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
  
  // Session flag - has user seen the About dialog this session?
  hasSeenAboutThisSession: boolean;
  
  // Loading state
  isChecking: boolean;
  
  // Actions
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setIsChecking: (checking: boolean) => void;
  dismissUpdate: () => void;
  markAboutSeen: () => void;
  
  // Computed - whether to show the notification badge
  shouldShowNotification: () => boolean;
}

export const useUpdateStore = create<UpdateStore>()(
  persist(
    (set, get) => ({
      updateInfo: null,
      dismissedVersion: null,
      hasSeenAboutThisSession: false,
      isChecking: false,
      
      setUpdateInfo: (info) => set({ updateInfo: info }),
      setIsChecking: (checking) => set({ isChecking: checking }),
      
      dismissUpdate: () => {
        const { updateInfo } = get();
        if (updateInfo?.latestVersion) {
          set({ dismissedVersion: updateInfo.latestVersion });
        }
      },
      
      // Mark as seen when user opens About dialog
      markAboutSeen: () => {
        const { updateInfo } = get();
        set({ 
          hasSeenAboutThisSession: true,
          // Also dismiss for this version
          dismissedVersion: updateInfo?.latestVersion ?? get().dismissedVersion,
        });
      },
      
      shouldShowNotification: () => {
        const { updateInfo, dismissedVersion, hasSeenAboutThisSession } = get();
        if (!updateInfo?.hasUpdate || !updateInfo.latestVersion) {
          return false;
        }
        // Don't show if user already seen About this session
        if (hasSeenAboutThisSession) {
          return false;
        }
        // Show if not dismissed or if a newer version was released
        return dismissedVersion !== updateInfo.latestVersion;
      },
    }),
    {
      name: 'dlman-update-store',
      partialize: (state) => ({
        // Only persist the dismissed version, not the session flag
        dismissedVersion: state.dismissedVersion,
      }),
    }
  )
);
