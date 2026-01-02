/**
 * Hook for checking app updates on startup
 * 
 * Checks for new versions once per session and shows a toast if an update is available
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { checkForUpdates, getReleasesPageUrl } from '@/lib/version';

// Only check once per session
let hasCheckedThisSession = false;

export function useUpdateCheck() {
  const hasRun = useRef(false);

  useEffect(() => {
    // Only run once per component mount and once per session
    if (hasRun.current || hasCheckedThisSession) {
      return;
    }
    hasRun.current = true;
    hasCheckedThisSession = true;

    // Check for updates after a short delay to not block app startup
    const timer = setTimeout(async () => {
      try {
        const updateInfo = await checkForUpdates();

        if (updateInfo.hasUpdate && updateInfo.latestVersion) {
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
      } catch (err) {
        // Silently fail - don't bother the user with update check errors
        console.warn('Update check failed:', err);
      }
    }, 3000); // Check after 3 seconds

    return () => clearTimeout(timer);
  }, []);
}
