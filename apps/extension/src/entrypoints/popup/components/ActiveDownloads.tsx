import { usePopupStore } from '../store';
import { formatBytes, truncate } from '@/lib/utils';
import { Download, FileDown } from 'lucide-react';

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
          <p className="text-xs text-center text-muted-foreground">
            +{activeDownloads.length - 5} more downloads
          </p>
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
  };
}

function DownloadItem({ download }: DownloadItemProps) {
  const progress = download.size 
    ? (download.downloaded / download.size) * 100 
    : 0;

  return (
    <div className="bg-card border rounded-lg p-2.5">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileDown className="w-4 h-4 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={download.filename}>
            {truncate(download.filename, 30)}
          </p>
          
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {progress.toFixed(0)}%
            </span>
          </div>
          
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{formatBytes(download.downloaded)}</span>
            {download.size && (
              <>
                <span>/</span>
                <span>{formatBytes(download.size)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
