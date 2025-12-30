import { motion, AnimatePresence } from 'framer-motion';
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
import { useDownloadStore } from '@/stores/downloads';
import { useUIStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

interface SelectionToolbarProps {
  className?: string;
}

export function SelectionToolbar({ className }: SelectionToolbarProps) {
  const { selectedIds, downloads, clearSelection, selectAll } = useDownloadStore();
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

  const handlePauseSelected = () => {
    // TODO: Implement pause for selected downloads
    console.log('Pause:', Array.from(selectedIds));
  };

  const handleResumeSelected = () => {
    // TODO: Implement resume for selected downloads
    console.log('Resume:', Array.from(selectedIds));
  };

  const handleStopSelected = () => {
    // TODO: Implement stop for selected downloads
    console.log('Stop:', Array.from(selectedIds));
  };

  const handleDeleteSelected = () => {
    openConfirmDialog({
      title: 'Delete Downloads',
      description: `Are you sure you want to remove ${selectedCount} download(s) from the list? This will not delete the files.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
      onConfirm: () => {
        // TODO: Call backend to delete downloads
        clearSelection();
      },
    });
  };

  const handleOpenFolders = () => {
    // TODO: Open folders for completed downloads
    console.log('Open folders for:', Array.from(selectedIds));
  };

  const handleSelectAll = () => {
    selectAll();
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
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ListTodo className="h-4 w-4" />
              <span className="hidden sm:inline">Move to Queue</span>
            </Button>

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
