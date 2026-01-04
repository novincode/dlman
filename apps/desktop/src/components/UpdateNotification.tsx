/**
 * Update notification indicator for the menu bar
 * Shows when a new version is available with download link
 */

import { X, Download, Sparkles } from 'lucide-react';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { Button } from '@/components/ui/button';
import { useUpdateStore } from '@/stores/update';
import { cn } from '@/lib/utils';

interface UpdateNotificationProps {
  className?: string;
}

export function UpdateNotification({ className }: UpdateNotificationProps) {
  const { updateInfo, dismissUpdate, shouldShowNotification } = useUpdateStore();
  
  const showNotification = shouldShowNotification();
  
  if (!showNotification || !updateInfo?.latestVersion) {
    return null;
  }
  
  const handleDownload = async () => {
    try {
      await openUrl(updateInfo.releaseUrl);
    } catch (err) {
      console.error('Failed to open URL:', err);
      window.open(updateInfo.releaseUrl, '_blank');
    }
  };
  
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg",
        "bg-gradient-to-r from-emerald-500/10 to-cyan-500/10",
        "border border-emerald-500/30",
        "animate-in fade-in slide-in-from-top-2 duration-300",
        className
      )}
    >
      <Sparkles className="h-4 w-4 text-emerald-500 animate-pulse" />
      <span className="text-xs font-medium text-foreground">
        v{updateInfo.latestVersion} available
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
        onClick={handleDownload}
      >
        <Download className="h-3 w-3 mr-1" />
        Update
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 text-muted-foreground hover:text-foreground"
        onClick={dismissUpdate}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

/**
 * Compact update badge - just shows a dot indicator
 * Can be used next to the About button
 */
export function UpdateBadge() {
  const { shouldShowNotification } = useUpdateStore();
  
  if (!shouldShowNotification()) {
    return null;
  }
  
  return (
    <span className="absolute -top-1 -right-1 flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
    </span>
  );
}
