import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { open as openPath } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import {
  Play,
  Pause,
  Square,
  Trash2,
  X,
  FolderOpen,
  RefreshCw,
  ListTodo,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDownloadStore, useFilteredDownloads } from '@/stores/downloads';
import { useQueuesArray } from '@/stores/queues';
import { useUIStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

interface SelectionToolbarProps {
  className?: string;
}

export function SelectionToolbar({ className }: SelectionToolbarProps) {
  const { selectedIds, downloads, clearSelection, selectAll, removeDownload, updateStatus, moveToQueue } = useDownloadStore();
  const filteredDownloads = useFilteredDownloads();
  const queues = useQueuesArray();
  const { openConfirmDialog } = useUIStore();

  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  // Get selected downloads
  const selectedDownloads = Array.from(selectedIds)
    .map(id => downloads.get(id))
    .filter(Boolean);

  // Check what actions are applicable
  const hasActive = selectedDownloads.some(d => d?.status === 'downloading');
  const hasPaused = selectedDownloads.some(d => d?.status === 'paused');
  const hasCompleted = selectedDownloads.some(d => d?.status === 'completed');
  const hasFailed = selectedDownloads.some(d => d?.status === 'failed');
  const hasPending = selectedDownloads.some(d => d?.status === 'pending' || d?.status === 'queued');
  const canPause = hasActive || hasPending;
  const canResume = hasPaused || hasFailed;

  const handlePauseSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    let successCount = 0;
    
    for (const id of ids) {
      const download = downloads.get(id);
      if (download && (download.status === 'downloading' || download.status === 'pending' || download.status === 'queued')) {
        // Update local state immediately
        updateStatus(id, 'paused', null);
        
        if (isTauri()) {
          try {
            await invoke('pause_download', { id });
            successCount++;
          } catch (err) {
            console.error(`Failed to pause download ${id}:`, err);
            // Revert on failure
            updateStatus(id, download.status, null);
          }
        } else {
          successCount++;
        }
      }
    }
    
    if (successCount > 0) {
      toast.success(`Paused ${successCount} download(s)`);
    }
  }, [selectedIds, downloads, updateStatus]);

  const handleResumeSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    let successCount = 0;
    
    for (const id of ids) {
      const download = downloads.get(id);
      if (download && (download.status === 'paused' || download.status === 'failed')) {
        // Update local state immediately
        updateStatus(id, 'downloading', null);
        
        if (isTauri()) {
          try {
            await invoke('resume_download', { id });
            successCount++;
          } catch (err) {
            console.error(`Failed to resume download ${id}:`, err);
            // Revert on failure
            updateStatus(id, download.status, null);
          }
        } else {
          successCount++;
        }
      }
    }
    
    if (successCount > 0) {
      toast.success(`Resumed ${successCount} download(s)`);
    }
  }, [selectedIds, downloads, updateStatus]);

  const handleStopSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    let successCount = 0;
    
    for (const id of ids) {
      const download = downloads.get(id);
      if (download && (download.status === 'downloading' || download.status === 'paused')) {
        // Update local state immediately
        updateStatus(id, 'cancelled', null);
        
        if (isTauri()) {
          try {
            await invoke('cancel_download', { id });
            successCount++;
          } catch (err) {
            console.error(`Failed to cancel download ${id}:`, err);
          }
        } else {
          successCount++;
        }
      }
    }
    
    if (successCount > 0) {
      toast.success(`Stopped ${successCount} download(s)`);
    }
  }, [selectedIds, downloads, updateStatus]);

  const handleDeleteSelected = useCallback(() => {
    openConfirmDialog({
      title: 'Delete Downloads',
      description: `Are you sure you want to remove ${selectedCount} download(s) from the list? This will not delete the files.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
      onConfirm: async () => {
        const ids = Array.from(selectedIds);
        for (const id of ids) {
          removeDownload(id);
          
          if (isTauri()) {
            try {
              await invoke('delete_download', { id, deleteFile: false });
            } catch (err) {
              console.error(`Failed to delete download ${id}:`, err);
            }
          }
        }
        clearSelection();
        toast.success(`Removed ${ids.length} download(s)`);
      },
    });
  }, [selectedIds, selectedCount, removeDownload, clearSelection, openConfirmDialog]);

  const handleOpenFolders = useCallback(async () => {
    const openedFolders = new Set<string>();
    
    for (const id of selectedIds) {
      const download = downloads.get(id);
      if (download && download.status === 'completed') {
        const folder = download.destination;
        if (!openedFolders.has(folder)) {
          openedFolders.add(folder);
          if (isTauri()) {
            try {
              await openPath(folder);
            } catch (err) {
              console.error(`Failed to open folder ${folder}:`, err);
            }
          }
        }
      }
    }
  }, [selectedIds, downloads]);

  const handleMoveToQueue = useCallback((queueId: string) => {
    const ids = Array.from(selectedIds);
    moveToQueue(ids, queueId);
    toast.success(`Moved ${ids.length} download(s) to queue`);
  }, [selectedIds, moveToQueue]);

  const handleSelectAll = () => {
    // Select only the currently filtered/visible downloads
    const filteredIds = filteredDownloads.map(d => d.id);
    selectAll(filteredIds);
  };

  return (
    <AnimatePresence>
      {hasSelection && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'overflow-hidden border-b bg-primary/5',
            className
          )}
        >
          <div className="flex items-center gap-1 px-2 py-1.5">
            {/* Selection count */}
            <div className="flex items-center gap-2 px-2">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                {selectedCount} selected
              </span>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Play/Resume button */}
            {canResume && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResumeSelected}
                className="gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/20"
              >
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">Resume</span>
              </Button>
            )}

            {/* Pause button */}
            {canPause && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePauseSelected}
                className="gap-1.5 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-900/20"
              >
                <Pause className="h-4 w-4" />
                <span className="hidden sm:inline">Pause</span>
              </Button>
            )}

            {/* Stop button */}
            {(hasActive || hasPaused) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStopSelected}
                className="gap-1.5"
              >
                <Square className="h-4 w-4" />
                <span className="hidden sm:inline">Stop</span>
              </Button>
            )}

            {/* Retry button for failed */}
            {hasFailed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResumeSelected}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Retry</span>
              </Button>
            )}

            {/* Open folder for completed */}
            {hasCompleted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenFolders}
                className="gap-1.5"
              >
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Open Folder</span>
              </Button>
            )}

            <Separator orientation="vertical" className="h-6" />

            {/* Move to queue */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <ListTodo className="h-4 w-4" />
                  <span className="hidden sm:inline">Move to Queue</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {queues.map((queue) => (
                  <DropdownMenuItem
                    key={queue.id}
                    onClick={() => handleMoveToQueue(queue.id)}
                  >
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: queue.color }}
                    />
                    {queue.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Separator orientation="vertical" className="h-6" />

            {/* Remove button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteSelected}
              className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Remove</span>
            </Button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Select All */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="gap-1.5"
            >
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Select All</span>
            </Button>

            {/* Clear selection */}
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="gap-1.5"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
