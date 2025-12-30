import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Link, 
  Folder, 
  Download, 
  Loader2, 
  CheckCircle2,
  XCircle,
  Clipboard
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUIStore } from '@/stores/ui';
import { useQueuesArray } from '@/stores/queues';
import { useSettingsStore } from '@/stores/settings';
import { useDownloadStore } from '@/stores/downloads';
import type { LinkInfo, Download as DownloadType } from '@/types';

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

export function NewDownloadDialog() {
  const { showNewDownloadDialog, setShowNewDownloadDialog } = useUIStore();
  const queues = useQueuesArray();
  const defaultPath = useSettingsStore((s) => s.settings.defaultDownloadPath);
  const addDownload = useDownloadStore((s) => s.addDownload);

  const [url, setUrl] = useState('');
  const [destination, setDestination] = useState(defaultPath);
  const [queueId, setQueueId] = useState('00000000-0000-0000-0000-000000000000');
  const [filename, setFilename] = useState('');
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (showNewDownloadDialog) {
      setUrl('');
      setFilename('');
      setFileSize(null);
      setProbeError(null);
      // Get the current default path at the time dialog opens
      const currentDefaultPath = useSettingsStore.getState().settings.defaultDownloadPath;
      setDestination(currentDefaultPath);
    }
  }, [showNewDownloadDialog]);

  // Probe URL when it changes (debounced)
  useEffect(() => {
    if (!url) {
      setFilename('');
      setFileSize(null);
      setProbeError(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsProbing(true);
        setProbeError(null);

        const results = await invoke<LinkInfo[]>('probe_links', { urls: [url] });
        const info = results[0];

        if (info?.error) {
          setProbeError(info.error);
          setFilename('');
          setFileSize(null);
        } else if (info) {
          setFilename(info.filename);
          setFileSize(info.size ?? null);
          setProbeError(null);
        }
      } catch (err) {
        setProbeError(err instanceof Error ? err.message : 'Failed to probe URL');
      } finally {
        setIsProbing(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [url]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        setUrl(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  }, []);

  const handleBrowseDestination = useCallback(async () => {
    // Check if we're in Tauri context
    if (!isTauri()) {
      toast.error('Browse is only available in the desktop app');
      return;
    }
    
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: destination.startsWith('~') 
          ? undefined // Let Tauri use default
          : destination,
      });

      if (selected) {
        setDestination(selected as string);
      }
    } catch (err) {
      console.error('Failed to open directory picker:', err);
      toast.error('Failed to open directory picker');
    }
  }, [destination]);

  const handleAddDownload = useCallback(async () => {
    if (!url || !destination) {
      toast.error('Please enter a URL and destination');
      return;
    }

    try {
      setIsAdding(true);
      
      // Try to add via Tauri backend
      if (isTauri()) {
        try {
          const download = await invoke<DownloadType>('add_download', {
            url,
            destination,
            queueId,
          });
          // Add to local store
          addDownload(download);
          toast.success('Download added successfully');
        } catch (err) {
          console.error('Backend add_download failed:', err);
          // Fallback: create local download
          const localDownload: DownloadType = {
            id: crypto.randomUUID(),
            url,
            final_url: null,
            filename: filename || url.split('/').pop() || 'unknown',
            destination,
            size: fileSize,
            downloaded: 0,
            status: 'pending',
            segments: [],
            queue_id: queueId,
            color: null,
            error: null,
            created_at: new Date().toISOString(),
            completed_at: null,
          };
          addDownload(localDownload);
          toast.success('Download added (offline mode)');
        }
      } else {
        // Not in Tauri, create local download
        const localDownload: DownloadType = {
          id: crypto.randomUUID(),
          url,
          final_url: null,
          filename: filename || url.split('/').pop() || 'unknown',
          destination,
          size: fileSize,
          downloaded: 0,
          status: 'pending',
          segments: [],
          queue_id: queueId,
          color: null,
          error: null,
          created_at: new Date().toISOString(),
          completed_at: null,
        };
        addDownload(localDownload);
        toast.success('Download added (preview mode)');
      }
      
      setShowNewDownloadDialog(false);
    } catch (err) {
      console.error('Failed to add download:', err);
      toast.error('Failed to add download');
    } finally {
      setIsAdding(false);
    }
  }, [url, destination, queueId, filename, fileSize, addDownload, setShowNewDownloadDialog]);

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  };

  return (
    <Dialog open={showNewDownloadDialog} onOpenChange={setShowNewDownloadDialog}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            New Download
          </DialogTitle>
          <DialogDescription>
            Enter the URL of the file you want to download.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* URL Input */}
          <div className="space-y-2">
            <Label htmlFor="url" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              URL
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/file.zip"
                  className="pr-10"
                />
                <AnimatePresence>
                  {isProbing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </motion.div>
                  )}
                  {!isProbing && filename && !probeError && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </motion.div>
                  )}
                  {!isProbing && probeError && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <XCircle className="h-4 w-4 text-destructive" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handlePasteFromClipboard}
                title="Paste from clipboard"
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </div>
            {probeError && (
              <p className="text-sm text-destructive">{probeError}</p>
            )}
          </div>

          {/* File Info */}
          <AnimatePresence>
            {filename && !probeError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-md border border-border bg-muted/50 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{filename}</span>
                  {fileSize && (
                    <span className="text-sm text-muted-foreground">
                      {formatFileSize(fileSize)}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Destination */}
          <div className="space-y-2">
            <Label htmlFor="destination" className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Save to
            </Label>
            <div className="flex gap-2">
              <Input
                id="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="/path/to/downloads"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleBrowseDestination}
              >
                Browse
              </Button>
            </div>
          </div>

          {/* Queue Selection */}
          <div className="space-y-2">
            <Label htmlFor="queue">Queue</Label>
            <Select value={queueId} onValueChange={setQueueId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a queue" />
              </SelectTrigger>
              <SelectContent>
                {queues.map((queue) => (
                  <SelectItem key={queue.id} value={queue.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: queue.color }}
                      />
                      {queue.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowNewDownloadDialog(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddDownload}
            disabled={!url || !destination || isProbing || !!probeError || isAdding}
          >
            {isAdding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Add Download
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
