import { useMemo, useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
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
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Gauge,
  Timer,
  Layers,
  Activity,
  Pencil,
  Save,
  X,
  FolderInput,
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { useQueueStore } from '@/stores/queues';
import { useCategoryStore } from '@/stores/categories';
import { useDownloadStore } from '@/stores/downloads';
import type { Download } from '@/types';
import { toast } from 'sonner';

interface DownloadInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  download: Download | null;
}

export function DownloadInfoDialog({ open, onOpenChange, download }: DownloadInfoDialogProps) {
  const queue = useQueueStore((s) => download ? s.queues.get(download.queue_id) : null);
  const updateDownload = useDownloadStore((s) => s.updateDownload);
  
  // Track speed and ETA for active downloads
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const lastDownloadedRef = useRef(download?.downloaded || 0);
  const lastTimeRef = useRef(Date.now());
  
  // Local speed limit state (in KB/s for UI, 0 = unlimited)
  const [speedLimitKB, setSpeedLimitKB] = useState(
    download?.speed_limit ? Math.round(download.speed_limit / 1024) : 0
  );
  
  // Destination editing state
  const [isEditingDestination, setIsEditingDestination] = useState(false);
  const [editedDestination, setEditedDestination] = useState(download?.destination || '');
  
  // Reset destination edit state when dialog opens/closes
  useEffect(() => {
    if (open && download) {
      setEditedDestination(download.destination);
      setIsEditingDestination(false);
    }
  }, [open, download?.destination]);
  
  // Handle destination change
  const handleSaveDestination = async () => {
    if (!download || editedDestination === download.destination) {
      setIsEditingDestination(false);
      return;
    }
    
    try {
      // For completed downloads, we need to move the file
      if (download.status === 'completed') {
        await invoke('move_download_file', {
          id: download.id,
          new_destination: editedDestination,
        });
        toast.success('File moved successfully');
      } else {
        // For pending/queued/paused downloads, just update the destination
        await invoke('update_download', {
          id: download.id,
          updates: { destination: editedDestination },
        });
        toast.success('Destination updated');
      }
      
      updateDownload(download.id, { destination: editedDestination });
      setIsEditingDestination(false);
    } catch (err) {
      console.error('Failed to update destination:', err);
      toast.error(`Failed to update destination: ${err}`);
    }
  };
  
  // Browse for folder
  const handleBrowseFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: editedDestination,
        title: 'Select Destination Folder',
      });
      
      if (selected && typeof selected === 'string') {
        setEditedDestination(selected);
      }
    } catch (err) {
      console.error('Failed to open folder dialog:', err);
    }
  };
  
  // Calculate speed and ETA for active downloads
  useEffect(() => {
    if (!download || download.status !== 'downloading') {
      setCurrentSpeed(0);
      setEta(null);
      return;
    }
    
    const interval = setInterval(() => {
      const now = Date.now();
      const timeDiff = (now - lastTimeRef.current) / 1000; // seconds
      const bytesDiff = download.downloaded - lastDownloadedRef.current;
      
      if (timeDiff > 0) {
        const speed = bytesDiff / timeDiff;
        setCurrentSpeed(speed);
        
        // Calculate ETA
        if (speed > 0 && download.size) {
          const remaining = download.size - download.downloaded;
          setEta(remaining / speed);
        } else {
          setEta(null);
        }
      }
      
      lastDownloadedRef.current = download.downloaded;
      lastTimeRef.current = now;
    }, 1000);
    
    return () => clearInterval(interval);
  }, [download?.status, download?.downloaded, download?.size]);
  
  // Update speed limit in backend - only on commit (when user releases slider)
  const handleSpeedLimitChange = (value: number[]) => {
    // Just update local state for UI responsiveness
    setSpeedLimitKB(value[0]);
  };
  
  // Called when user releases the slider
  const handleSpeedLimitCommit = async (value: number[]) => {
    const kbps = value[0];
    if (download) {
      const bytesPerSecond = kbps === 0 ? null : kbps * 1024;
      updateDownload(download.id, { speed_limit: bytesPerSecond });
      
      try {
        await invoke('update_download', {
          id: download.id,
          updates: { speed_limit: bytesPerSecond },
        });
      } catch (err) {
        console.error('Failed to update speed limit:', err);
      }
    }
  };
  
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

  const handleOpenFolder = async () => {
    try {
      const filePath = `${download.destination}/${download.filename}`;
      await invoke('show_in_folder', { path: filePath });
    } catch (err) {
      console.error('Failed to open folder:', err);
      toast.error('Failed to open folder');
    }
  };

  const handleOpenFile = async () => {
    try {
      const filePath = `${download.destination}/${download.filename}`;
      await invoke('open_file', { path: filePath });
    } catch (err) {
      console.error('Failed to open file:', err);
      toast.error('Failed to open file');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatEta = (seconds: number | null) => {
    if (seconds === null) return 'Calculating...';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  };

  // Format speed limit (KB/s value) with auto-scaling to MB/s or GB/s
  const formatSpeedLimitDisplay = (kbps: number) => {
    if (kbps === 0) return 'Unlimited';
    if (kbps < 1024) return `${kbps} KB/s`;
    if (kbps < 1024 * 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
    return `${(kbps / (1024 * 1024)).toFixed(2)} GB/s`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileType className="h-5 w-5 shrink-0" />
            <span className="truncate">{download.filename}</span>
          </DialogTitle>
          <DialogDescription>
            Detailed information about this download
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-1 -mx-1">
          <div className="space-y-4 py-4 px-0.5">
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

          {/* Live Stats for Active Downloads */}
          {download.status === 'downloading' && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-blue-500 animate-pulse" />
                  <span className="font-medium">Live Statistics</span>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-1.5">
                <Progress value={progress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatBytes(download.downloaded)} / {download.size ? formatBytes(download.size) : 'Unknown'}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Gauge className="h-3.5 w-3.5" />
                    Speed
                  </p>
                  <p className="font-medium text-blue-500">{formatSpeed(currentSpeed)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3.5 w-3.5" />
                    Time Remaining
                  </p>
                  <p className="font-medium">{formatEta(eta)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Speed Limit Control */}
          {(download.status === 'downloading' || download.status === 'paused' || download.status === 'queued' || download.status === 'pending') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Gauge className="h-3.5 w-3.5" />
                  Speed Limit
                </Label>
                <span className="text-sm font-medium">
                  {formatSpeedLimitDisplay(speedLimitKB)}
                </span>
              </div>
              <Slider
                value={[speedLimitKB]}
                onValueChange={handleSpeedLimitChange}
                onValueCommit={handleSpeedLimitCommit}
                max={10240}
                step={64}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Set to 0 for unlimited speed. This overrides the global speed limit for this download.
              </p>
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

          {/* Location - Editable */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <FolderOpen className="h-3.5 w-3.5" />
                Save Location
              </p>
              {!isEditingDestination && download.status !== 'downloading' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setIsEditingDestination(true)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>
            
            {isEditingDestination ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={editedDestination}
                    onChange={(e) => setEditedDestination(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="Enter destination path"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={handleBrowseFolder}
                  >
                    <FolderInput className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveDestination}>
                    <Save className="h-3.5 w-3.5 mr-1" />
                    {download.status === 'completed' ? 'Move File' : 'Save'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditingDestination(false);
                      setEditedDestination(download.destination);
                    }}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Cancel
                  </Button>
                </div>
                {download.status === 'completed' && (
                  <p className="text-xs text-muted-foreground">
                    The downloaded file will be moved to the new location.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm font-mono bg-muted rounded px-2 py-1 break-all">
                {download.destination}
              </p>
            )}
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
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />
                  Segments ({download.segments.length})
                </p>
                
                {/* Segment Visualization */}
                <div className="flex gap-0.5 h-3 rounded overflow-hidden bg-muted">
                  {download.segments.map((segment, index) => {
                    // Handle unknown size (end = MAX u64 value)
                    const isUnknownSize = segment.end > Number.MAX_SAFE_INTEGER / 2;
                    const segmentSize = isUnknownSize ? segment.downloaded : (segment.end - segment.start + 1);
                    const segmentProgress = segment.complete 
                      ? 100
                      : (isUnknownSize 
                          ? (segment.downloaded > 0 ? 50 : 0)
                          : (segmentSize > 0 ? ((segment.downloaded || 0) / segmentSize) * 100 : 0));
                    const displaySize = isUnknownSize ? `${formatBytes(segment.downloaded || 0)} (streaming)` : formatBytes(segmentSize);
                    return (
                      <div
                        key={index}
                        className="flex-1 relative"
                        title={`Segment ${index + 1}: ${formatBytes(segment.downloaded || 0)} / ${displaySize}`}
                      >
                        <div
                          className="absolute inset-0 bg-primary/40 transition-all"
                          style={{ width: `${segmentProgress}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                
                {/* Segment Details */}
                <ScrollArea className="h-24">
                  <div className="space-y-1 text-xs">
                    {download.segments.map((segment, index) => {
                      const isUnknownSize = segment.end > Number.MAX_SAFE_INTEGER / 2;
                      const segmentSize = isUnknownSize ? segment.downloaded : (segment.end - segment.start + 1);
                      const displaySize = isUnknownSize ? "(streaming)" : formatBytes(segmentSize);
                      return (
                        <div key={index} className="flex items-center justify-between px-2 py-1 rounded bg-muted/50">
                          <span className="font-medium">Segment {index + 1}</span>
                          <span className="text-muted-foreground">
                            {formatBytes(segment.downloaded || 0)} / {displaySize}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
          </div>
        </div>

        {/* Actions - Fixed at bottom */}
        <div className="flex flex-wrap gap-2 pt-4 border-t shrink-0">
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
