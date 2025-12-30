import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  FolderOpen,
  ExternalLink,
  Copy,
  RefreshCw,
  Calendar,
  HardDrive,
  Link2,
  FileType,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  Download as DownloadIcon,
  ListTodo,
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { useQueueStore } from '@/stores/queues';
import { useCategoryStore } from '@/stores/categories';
import type { Download } from '@/types';
import { toast } from 'sonner';

interface DownloadInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  download: Download | null;
}

export function DownloadInfoDialog({ open, onOpenChange, download }: DownloadInfoDialogProps) {
  const queue = useQueueStore((s) => download ? s.queues.get(download.queue_id) : null);
  
  const category = useMemo(() => {
    if (!download) return null;
    const ext = download.filename.split('.').pop()?.toLowerCase();
    if (!ext) return null;
    const categories = useCategoryStore.getState().categories;
    for (const cat of categories.values()) {
      if (cat.extensions.includes(ext)) {
        return cat;
      }
    }
    return null;
  }, [download]);

  if (!download) return null;

  const progress = download.size ? (download.downloaded / download.size) * 100 : 0;

  const getStatusInfo = () => {
    switch (download.status) {
      case 'completed':
        return { icon: CheckCircle2, color: 'text-green-500', label: 'Completed' };
      case 'downloading':
        return { icon: DownloadIcon, color: 'text-blue-500', label: 'Downloading' };
      case 'paused':
        return { icon: Pause, color: 'text-yellow-500', label: 'Paused' };
      case 'failed':
        return { icon: XCircle, color: 'text-red-500', label: 'Failed' };
      case 'queued':
      case 'pending':
        return { icon: Clock, color: 'text-muted-foreground', label: 'Queued' };
      default:
        return { icon: Clock, color: 'text-muted-foreground', label: download.status };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(download.url);
      toast.success('URL copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy URL');
    }
  };

  const handleOpenFolder = () => {
    // TODO: Implement with Tauri shell plugin
    toast.info('Open folder functionality');
  };

  const handleOpenFile = () => {
    // TODO: Implement with Tauri shell plugin
    toast.info('Open file functionality');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FileType className="h-5 w-5 shrink-0" />
            <span className="truncate">{download.filename}</span>
          </DialogTitle>
          <DialogDescription>
            Detailed information about this download
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon className={`h-5 w-5 ${statusInfo.color}`} />
              <span className="font-medium">{statusInfo.label}</span>
            </div>
            {download.status !== 'completed' && download.status !== 'failed' && (
              <Badge variant="outline">{Math.round(progress)}%</Badge>
            )}
          </div>

          {download.error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {download.error}
            </div>
          )}

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-1">
                <HardDrive className="h-3.5 w-3.5" />
                Size
              </p>
              <p className="font-medium">
                {download.size ? formatBytes(download.size) : 'Unknown'}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-1">
                <DownloadIcon className="h-3.5 w-3.5" />
                Downloaded
              </p>
              <p className="font-medium">{formatBytes(download.downloaded)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Started
              </p>
              <p className="font-medium">{formatDate(download.created_at)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completed
              </p>
              <p className="font-medium">{formatDate(download.completed_at)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-1">
                <ListTodo className="h-3.5 w-3.5" />
                Queue
              </p>
              <div className="flex items-center gap-2">
                {queue && (
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: queue.color }}
                  />
                )}
                <p className="font-medium">{queue?.name || 'Unknown'}</p>
              </div>
            </div>

            {category && (
              <div className="space-y-1">
                <p className="text-muted-foreground flex items-center gap-1">
                  <FileType className="h-3.5 w-3.5" />
                  Category
                </p>
                <p className="font-medium">{category.name}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Location */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <FolderOpen className="h-3.5 w-3.5" />
              Save Location
            </p>
            <p className="text-sm font-mono bg-muted rounded px-2 py-1 break-all">
              {download.destination}
            </p>
          </div>

          {/* URL */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              URL
            </p>
            <p className="text-sm font-mono bg-muted rounded px-2 py-1 break-all line-clamp-2">
              {download.url}
            </p>
          </div>

          {download.segments && download.segments.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Segments: {download.segments.length}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleCopyUrl}>
            <Copy className="h-4 w-4 mr-2" />
            Copy URL
          </Button>
          {download.status === 'completed' && (
            <>
              <Button variant="outline" size="sm" onClick={handleOpenFile}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open File
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenFolder}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Open Folder
              </Button>
            </>
          )}
          {download.status === 'failed' && (
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
