import { useState, useEffect } from 'react';
import { Download, Github, Heart, Coffee, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';
import { open as openUrl } from '@tauri-apps/plugin-shell';

const GITHUB_URL = 'https://github.com/novincode/dlman';
const SPONSORS_URL = 'https://github.com/sponsors/novincode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui';
import { useUpdateStore } from '@/stores/update';
import { getAppVersion, checkForUpdates, getReleasesPageUrl, type UpdateInfo } from '@/lib/version';

export function AboutDialog() {
  const { showAboutDialog, setShowAboutDialog } = useUIStore();
  const markAboutSeen = useUpdateStore((s) => s.markAboutSeen);
  const [version, setVersion] = useState<string>('...');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // Mark about as seen when dialog opens (dismisses update badge for this session)
  useEffect(() => {
    if (showAboutDialog) {
      markAboutSeen();
      getAppVersion().then((info) => setVersion(info.current));
    }
  }, [showAboutDialog, markAboutSeen]);

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const info = await checkForUpdates();
      setUpdateInfo(info);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleOpenReleasePage = () => {
    const url = updateInfo?.releaseUrl || getReleasesPageUrl();
    openUrl(url);
  };

  return (
    <Dialog open={showAboutDialog} onOpenChange={setShowAboutDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Download className="h-12 w-12 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-2xl text-center">DLMan</DialogTitle>
          <DialogDescription className="text-center">
            Download Manager
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-center">
            <p className="text-muted-foreground text-sm">Version {version}</p>
          </div>

          {/* Update Check Section */}
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdate}
            >
              <RefreshCw className={`h-4 w-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
            </Button>
            
            {updateInfo && (
              <div className="text-center">
                {updateInfo.hasUpdate ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <Sparkles className="h-4 w-4" />
                      <span>New version available: v{updateInfo.latestVersion}</span>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-2"
                      onClick={handleOpenReleasePage}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Download Update
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    You're on the latest version!
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>A modern, fast, and reliable download manager</p>
            <p>built with Rust and React.</p>
          </div>

          <div className="flex flex-col gap-2 items-center pt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => openUrl(GITHUB_URL)}
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => openUrl(SPONSORS_URL)}
            >
              <Coffee className="h-4 w-4" />
              Buy me a coffee
            </Button>
          </div>

          <div className="text-center text-xs text-muted-foreground pt-4">
            <p className="flex items-center justify-center gap-1">
              Made with <Heart className="h-3 w-3 text-red-500" /> by the DLMan Team
            </p>
            <p className="mt-1">© 2025 DLMan. All rights reserved.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
