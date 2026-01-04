import { useState } from 'react';
import { usePopupStore } from '../store';
import { formatBytes, truncate } from '@/lib/utils';
import { Download, FileDown, Pause, Play, X, Loader2, CheckCircle } from 'lucide-react';
import { getDlmanClient } from '@/lib/api-client';

export function ActiveDownloads() {
  const { activeDownloads, isConnected } = usePopupStore();

  if (!isConnected) {
    return null;
  }

  if (activeDownloads.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <FileDown className="w-12 h-12 mb-2 opacity-50" />
        <p className="text-sm">No active downloads</p>
        <p className="text-xs mt-1">Downloads will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex items-center gap-2 mb-2">
        <Download className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">
          Active Downloads ({activeDownloads.length})
        </span>
      </div>
      
      <div className="space-y-2">
        {activeDownloads.slice(0, 5).map((download) => (
          <DownloadItem key={download.id} download={download} />
        ))}
        
        {activeDownloads.length > 5 && (
          <button
            onClick={() => window.location.href = 'dlman://'}
            className="w-full py-2 text-xs text-primary hover:underline"
          >
            +{activeDownloads.length - 5} more - Open in App
          </button>
        )}
      </div>
    </div>
  );
}

interface DownloadItemProps {
  download: {
    id: string;
    filename: string;
    downloaded: number;
    size: number | null;
    status: string;
    speed?: number;
  };
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond} B/s`;
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  } else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
}

function DownloadItem({ download }: DownloadItemProps) {
  const [isLoading, setIsLoading] = useState(false);
  const progress = download.size 
    ? (download.downloaded / download.size) * 100 
    : 0;

  const handlePause = async () => {
    setIsLoading(true);
    try {
      const client = getDlmanClient();
      await client.pauseDownload(download.id);
    } catch (err) {
      console.error('Failed to pause:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResume = async () => {
    setIsLoading(true);
    try {
      const client = getDlmanClient();
      await client.resumeDownload(download.id);
    } catch (err) {
      console.error('Failed to resume:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    setIsLoading(true);
    try {
      const client = getDlmanClient();
      await client.cancelDownload(download.id);
    } catch (err) {
      console.error('Failed to cancel:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const isDownloading = download.status === 'downloading';
  const isPaused = download.status === 'paused';
  const isPending = download.status === 'pending' || download.status === 'queued';

  // Status indicator
  const StatusIcon = () => {
    if (isDownloading) {
      return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
    }
    if (isPaused) {
      return <Pause className="w-3 h-3 text-orange-500" />;
    }
    if (isPending) {
      return <div className="w-3 h-3 rounded-full bg-yellow-500/50" />;
    }
    return <CheckCircle className="w-3 h-3 text-green-500" />;
  };

  return (
    <div className="bg-card border rounded-lg p-2.5">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileDown className="w-4 h-4 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <StatusIcon />
            <p className="text-sm font-medium truncate flex-1" title={download.filename}>
              {truncate(download.filename, 25)}
            </p>
          </div>
          
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isDownloading ? 'bg-blue-500' : isPaused ? 'bg-orange-500' : 'bg-primary'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-10 text-right">
              {progress.toFixed(0)}%
            </span>
          </div>
          
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatBytes(download.downloaded)}</span>
              {download.size && (
                <>
                  <span>/</span>
                  <span>{formatBytes(download.size)}</span>
                </>
              )}
              {isDownloading && download.speed && download.speed > 0 && (
                <>
                  <span>•</span>
                  <span className="text-primary">{formatSpeed(download.speed)}</span>
                </>
              )}
            </div>
            
            {/* Controls */}
            <div className="flex items-center gap-1">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  {isDownloading && (
                    <button
                      onClick={handlePause}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      title="Pause"
                    >
                      <Pause className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                  {(isPaused || isPending) && (
                    <button
                      onClick={handleResume}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      title="Resume"
                    >
                      <Play className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                  <button
                    onClick={handleCancel}
                    className="p-1 hover:bg-muted rounded transition-colors"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
