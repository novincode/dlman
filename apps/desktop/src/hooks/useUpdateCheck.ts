/**
 * Hook for checking app updates on startup
 * 
 * Checks for new versions once per session and updates the store
 * Also shows a toast notification if an update is available
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { checkForUpdates, getReleasesPageUrl } from '@/lib/version';
import { useUpdateStore } from '@/stores/update';

// Only check once per session
let hasCheckedThisSession = false;

export function useUpdateCheck() {
  const hasRun = useRef(false);
  const { setUpdateInfo, setIsChecking, shouldShowNotification } = useUpdateStore();

  useEffect(() => {
    // Only run once per component mount and once per session
    if (hasRun.current || hasCheckedThisSession) {
      return;
    }
    hasRun.current = true;
    hasCheckedThisSession = true;

    // Check for updates after a short delay to not block app startup
    const timer = setTimeout(async () => {
      setIsChecking(true);
      try {
        const updateInfo = await checkForUpdates();
        setUpdateInfo(updateInfo);

        // Show toast only if notification not dismissed
        if (updateInfo.hasUpdate && updateInfo.latestVersion) {
          const store = useUpdateStore.getState();
          if (store.shouldShowNotification()) {
            toast.info(`New version available: v${updateInfo.latestVersion}`, {
              description: 'Click to download the latest version',
              duration: 10000,
              action: {
                label: 'Download',
                onClick: () => {
                  openUrl(updateInfo.releaseUrl || getReleasesPageUrl());
                }
              }
            });
          }
        }
      } catch (err) {
        // Silently fail - don't bother the user with update check errors
        console.warn('Update check failed:', err);
        setUpdateInfo(null);
      } finally {
        setIsChecking(false);
      }
    }, 3000); // Check after 3 seconds

    return () => clearTimeout(timer);
  }, [setUpdateInfo, setIsChecking, shouldShowNotification]);
}
