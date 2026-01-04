import { usePopupStore } from '../store';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

export function ConnectionStatus() {
  const { isConnected, isConnecting, settings, refresh } = usePopupStore();

  if (!settings?.enabled) {
    return (
      <div className="px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">Extension is disabled</span>
        </div>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Connecting to DLMan...</span>
        </div>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm">Connected to DLMan</span>
          </div>
          <button
            onClick={refresh}
            className="p-1 hover:bg-green-500/20 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-destructive">
          <XCircle className="w-4 h-4" />
          <span className="text-sm">DLMan not running</span>
        </div>
        <button
          onClick={() => browser.runtime.sendMessage({ type: 'connect' })}
          className="text-xs px-2 py-1 bg-destructive/20 hover:bg-destructive/30 rounded transition-colors"
        >
          Retry
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Start DLMan to capture downloads
      </p>
    </div>
  );
}
