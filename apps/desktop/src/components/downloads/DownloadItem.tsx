import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { open as openPath } from "@tauri-apps/plugin-shell";
import { toast } from "sonner";
import {
  FileIcon,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  Clock,
  MoreHorizontal,
  FolderOpen,
  Trash2,
  ExternalLink,
  Info,
  Copy,
  RefreshCw,
  Square,
  ListTodo,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useDownloadStore } from "@/stores/downloads";
import { useQueueStore, useQueuesArray } from "@/stores/queues";
import { formatBytes, formatSpeed, formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { DownloadInfoDialog } from "@/components/dialogs/DownloadInfoDialog";
import type { Download, DownloadStatus } from "@/types";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

interface DownloadItemProps {
  download: Download & { speed?: number; eta?: number | null };
}

export function DownloadItem({ download }: DownloadItemProps) {
  const { selectedIds, toggleSelected, removeDownload, updateStatus, moveToQueue } = useDownloadStore();
  const isSelected = selectedIds.has(download.id);
  const queue = useQueueStore((s) => s.queues.get(download.queue_id));
  const queues = useQueuesArray();
  const [showInfoDialog, setShowInfoDialog] = useState(false);

  const progress = download.size
    ? (download.downloaded / download.size) * 100
    : 0;

  const handlePause = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Update local state immediately
    updateStatus(download.id, "paused", null);
    
    if (isTauri()) {
      try {
        await invoke("pause_download", { id: download.id });
        toast.success("Download paused");
      } catch (err) {
        console.error("Failed to pause download:", err);
        // Revert on failure
        updateStatus(download.id, "downloading", null);
        toast.error("Failed to pause download");
      }
    }
  }, [download.id, updateStatus]);

  const handleResume = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Update local state immediately
    updateStatus(download.id, "downloading", null);
    
    if (isTauri()) {
      try {
        await invoke("resume_download", { id: download.id });
        toast.success("Download resumed");
      } catch (err) {
        console.error("Failed to resume download:", err);
        // Revert on failure
        updateStatus(download.id, "paused", null);
        toast.error("Failed to resume download");
      }
    }
  }, [download.id, updateStatus]);

  const handleCancel = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Update local state immediately
    updateStatus(download.id, "cancelled", null);
    
    if (isTauri()) {
      try {
        await invoke("cancel_download", { id: download.id });
        toast.success("Download cancelled");
      } catch (err) {
        console.error("Failed to cancel download:", err);
        toast.error("Failed to cancel download");
      }
    }
  }, [download.id, updateStatus]);

  const handleRemove = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    removeDownload(download.id);
    toast.success("Download removed");
  }, [download.id, removeDownload]);

  const handleCopyUrl = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(download.url);
      toast.success("URL copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy URL");
    }
  }, [download.url]);

  const handleOpenFolder = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isTauri()) {
      try {
        // Open the destination folder
        await openPath(download.destination);
      } catch (err) {
        console.error("Failed to open folder:", err);
        toast.error("Failed to open folder");
      }
    } else {
      toast.info("Open folder is only available in the desktop app");
    }
  }, [download.destination]);

  const handleOpenFile = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isTauri() && download.status === "completed") {
      try {
        // Open the file
        const filePath = `${download.destination}/${download.filename}`;
        await openPath(filePath);
      } catch (err) {
        console.error("Failed to open file:", err);
        toast.error("Failed to open file");
      }
    } else {
      toast.info("File not available");
    }
  }, [download.destination, download.filename, download.status]);

  const handleShowInfo = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowInfoDialog(true);
  }, []);

  const handleMoveToQueue = useCallback((queueId: string) => {
    moveToQueue([download.id], queueId);
    toast.success("Moved to queue");
  }, [download.id, moveToQueue]);

  // Determine which primary action button to show
  const renderPrimaryAction = () => {
    switch (download.status) {
      case "downloading":
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-900/20"
            onClick={handlePause}
            title="Pause"
          >
            <Pause className="h-4 w-4" />
          </Button>
        );
      case "paused":
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-green-500 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20"
            onClick={handleResume}
            title="Resume"
          >
            <Play className="h-4 w-4" />
          </Button>
        );
      case "failed":
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-primary hover:bg-primary/10"
            onClick={handleResume}
            title="Retry"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        );
      case "completed":
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleOpenFolder}
            title="Open Folder"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        );
      case "queued":
      case "pending":
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-green-500 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20"
            onClick={handleResume}
            title="Start"
          >
            <Play className="h-4 w-4" />
          </Button>
        );
      default:
        return null;
    }
  };

  // Menu items for both context menu and dropdown
  const renderMenuItems = (isDropdown: boolean) => {
    const MenuItem = isDropdown ? DropdownMenuItem : ContextMenuItem;
    const MenuSeparator = isDropdown ? DropdownMenuSeparator : ContextMenuSeparator;
    const MenuSub = isDropdown ? DropdownMenuSub : ContextMenuSub;
    const MenuSubTrigger = isDropdown ? DropdownMenuSubTrigger : ContextMenuSubTrigger;
    const MenuSubContent = isDropdown ? DropdownMenuSubContent : ContextMenuSubContent;

    return (
      <>
        {/* Status-specific actions */}
        {download.status === "completed" && (
          <>
            <MenuItem onClick={handleOpenFile}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open File
            </MenuItem>
            <MenuItem onClick={handleOpenFolder}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Open Folder
            </MenuItem>
            <MenuSeparator />
          </>
        )}

        {download.status === "downloading" && (
          <MenuItem onClick={handlePause}>
            <Pause className="h-4 w-4 mr-2" />
            Pause
          </MenuItem>
        )}

        {download.status === "paused" && (
          <MenuItem onClick={handleResume}>
            <Play className="h-4 w-4 mr-2" />
            Resume
          </MenuItem>
        )}

        {download.status === "failed" && (
          <MenuItem onClick={handleResume}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Download
          </MenuItem>
        )}

        {(download.status === "downloading" || download.status === "paused") && (
          <MenuItem onClick={handleCancel}>
            <Square className="h-4 w-4 mr-2" />
            Stop Download
          </MenuItem>
        )}

        {(download.status === "queued" || download.status === "pending") && (
          <MenuItem onClick={handleResume}>
            <Play className="h-4 w-4 mr-2" />
            Start Now
          </MenuItem>
        )}

        <MenuSeparator />

        {/* Info */}
        <MenuItem onClick={handleShowInfo}>
          <Info className="h-4 w-4 mr-2" />
          Show Info
        </MenuItem>

        {/* Copy URL */}
        <MenuItem onClick={handleCopyUrl}>
          <Copy className="h-4 w-4 mr-2" />
          Copy URL
        </MenuItem>

        {/* Move to Queue */}
        <MenuSub>
          <MenuSubTrigger>
            <ListTodo className="h-4 w-4 mr-2" />
            Move to Queue
          </MenuSubTrigger>
          <MenuSubContent>
            {queues.map((q) => (
              <MenuItem
                key={q.id}
                onClick={() => handleMoveToQueue(q.id)}
                className={q.id === download.queue_id ? "bg-accent" : ""}
              >
                <div
                  className="w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: q.color }}
                />
                {q.name}
              </MenuItem>
            ))}
          </MenuSubContent>
        </MenuSub>

        <MenuSeparator />

        {/* Delete options */}
        <MenuItem onClick={handleRemove} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Remove from List
        </MenuItem>
        <MenuItem className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete File
        </MenuItem>
      </>
    );
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors group cursor-pointer",
              isSelected && "border-primary bg-primary/5"
            )}
            onClick={() => toggleSelected(download.id)}
          >
            {/* Checkbox */}
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelected(download.id)}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />

            {/* Queue Color Indicator */}
            {queue && (
              <div
                className="w-1 h-10 rounded-full shrink-0"
                style={{ backgroundColor: queue.color }}
              />
            )}

            {/* File Icon */}
            <div className="shrink-0">
              <StatusIcon status={download.status} />
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              {/* Filename and Status */}
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{download.filename}</span>
                <StatusBadge status={download.status} />
              </div>

              {/* Progress Bar (for active downloads) */}
              {(download.status === "downloading" ||
                download.status === "paused") && (
                <div className="mt-1.5">
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}

              {/* Details */}
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {/* Size */}
                <span>
                  {formatBytes(download.downloaded)}
                  {download.size && ` / ${formatBytes(download.size)}`}
                </span>

                {/* Speed (for active downloads) */}
                {download.status === "downloading" && download.speed && (
                  <span className="text-primary">{formatSpeed(download.speed)}</span>
                )}

                {/* ETA */}
                {download.status === "downloading" && download.eta && (
                  <span>{formatDuration(download.eta)} remaining</span>
                )}

                {/* Error */}
                {download.status === "failed" && download.error && (
                  <span className="text-destructive truncate max-w-[200px]">
                    {download.error}
                  </span>
                )}
              </div>
            </div>

            {/* Actions - Always visible primary action + More menu */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Primary action button (always visible) */}
              {renderPrimaryAction()}

              {/* More options */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {renderMenuItems(true)}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        </ContextMenuTrigger>

        {/* Context Menu */}
        <ContextMenuContent>
          {renderMenuItems(false)}
        </ContextMenuContent>
      </ContextMenu>

      {/* Info Dialog */}
      <DownloadInfoDialog
        open={showInfoDialog}
        onOpenChange={setShowInfoDialog}
        download={download}
      />
    </>
  );
}

function StatusIcon({ status }: { status: DownloadStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-8 w-8 text-green-500" />;
    case "failed":
      return <XCircle className="h-8 w-8 text-destructive" />;
    case "paused":
      return <Pause className="h-8 w-8 text-yellow-500" />;
    case "downloading":
      return (
        <div className="relative">
          <FileIcon className="h-8 w-8 text-primary" />
          <motion.div
            className="absolute inset-0 border-2 border-primary rounded-full"
            style={{ borderTopColor: "transparent" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>
      );
    case "queued":
    case "pending":
      return <Clock className="h-8 w-8 text-muted-foreground" />;
    default:
      return <FileIcon className="h-8 w-8 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: DownloadStatus }) {
  const variants: Record<DownloadStatus, string> = {
    pending: "bg-muted text-muted-foreground",
    downloading: "bg-primary/10 text-primary",
    paused: "bg-yellow-500/10 text-yellow-500",
    completed: "bg-green-500/10 text-green-500",
    failed: "bg-destructive/10 text-destructive",
    queued: "bg-muted text-muted-foreground",
    cancelled: "bg-muted text-muted-foreground",
  };

  const labels: Record<DownloadStatus, string> = {
    pending: "Pending",
    downloading: "Downloading",
    paused: "Paused",
    completed: "Completed",
    failed: "Failed",
    queued: "Queued",
    cancelled: "Cancelled",
  };

  return (
    <span
      className={cn(
        "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase",
        variants[status]
      )}
    >
      {labels[status]}
    </span>
  );
}
