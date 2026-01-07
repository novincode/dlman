import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
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
  ChevronDown,
  ChevronRight,
  Gauge,
  Zap,
  CheckSquare,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { DeleteConfirmDialog } from "@/components/dialogs/DeleteConfirmDialog";
import { useDownloadStore } from "@/stores/downloads";
import { useQueueStore, useQueuesArray } from "@/stores/queues";
import { useCategoryStore } from "@/stores/categories";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { formatBytes, formatSpeed, formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { DownloadInfoDialog } from "@/components/dialogs/DownloadInfoDialog";
import { useFileDrag, canDragDownload } from "@/hooks/useFileDrag";
import type { Download, DownloadStatus } from "@/types";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

interface DownloadItemProps {
  download: Download & { speed?: number; eta?: number | null };
  isFocused?: boolean;
}

export function DownloadItem({ download, isFocused = false }: DownloadItemProps) {
  const { selectedIds, toggleSelected, removeDownload, updateStatus, updateDownload, moveToQueue, setFocusedId } = useDownloadStore();
  const isSelected = selectedIds.has(download.id);
  const isSelectionMode = selectedIds.size > 0; // Selection mode is active when any items are selected
  const queue = useQueueStore((s) => s.queues.get(download.queue_id));
  const queues = useQueuesArray();
  const category = useCategoryStore((s) => download.category_id ? s.categories.get(download.category_id) : null);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [speedLimitInput, setSpeedLimitInput] = useState<string>(
    download.speed_limit ? Math.round(download.speed_limit / 1024).toString() : ""
  );
  
  // File drag-out support for completed downloads
  const { handleDragStart: handleFileDragStart, isSupported: isDragSupported } = useFileDrag({
    onDragEnd: (dropped) => {
      if (dropped) {
        toast.success('File dropped successfully');
      }
    },
  });
  const canDrag = canDragDownload(download) && isDragSupported;

  // Sync speedLimitInput when download changes
  useEffect(() => {
    if (download.speed_limit) {
      setSpeedLimitInput(Math.round(download.speed_limit / 1024).toString());
    } else {
      setSpeedLimitInput("");
    }
  }, [download.speed_limit]);
  const [fileExists, setFileExists] = useState<boolean | null>(null);

  const progress = download.size
    ? (download.downloaded / download.size) * 100
    : 0;

  // Get effective speed limit for display
  const effectiveSpeedLimit = download.speed_limit || null;

  // Check if file exists for completed downloads
  useEffect(() => {
    if (isTauri() && download.status === "completed" && fileExists === null) {
      const checkFile = async () => {
        try {
          const exists = await invoke<boolean>("file_exists", { 
            path: `${download.destination}/${download.filename}` 
          });
          setFileExists(exists);
        } catch (err) {
          console.error("Failed to check file existence:", err);
          setFileExists(true); // Assume exists on error
        }
      };
      checkFile();
    }
  }, [download.status, download.destination, download.filename, fileExists]);


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
    if (isTauri()) {
      try {
        await invoke("cancel_download", { id: download.id });
        toast.success("Download cancelled");
      } catch (err) {
        console.error("Failed to cancel download:", err);
        toast.error("Failed to cancel download");
      }
    }
    updateStatus(download.id, "cancelled", null);
  }, [download.id, updateStatus]);

  const handleRemove = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Show the dialog
    setShowRemoveDialog(true);
  }, []);

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
        // Open the destination folder using our custom command
        await invoke("open_folder", { path: download.destination });
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
        // Show the file in folder (highlights it)
        const filePath = `${download.destination}/${download.filename}`;
        await invoke("show_in_folder", { path: filePath });
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

  const handleRedownload = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    if (isTauri()) {
      try {
        // Retry the existing download instead of creating a new one
        await invoke("retry_download", { id: download.id });
        toast.success("Download restarted");
      } catch (err) {
        console.error("Failed to retry download:", err);
        toast.error("Failed to restart download");
      }
    } else {
      // Fallback: just update status to pending
      updateStatus(download.id, "pending", null);
      toast.info("Download queued for retry");
    }
  }, [download.url, download.destination, download.queue_id, download.id, updateStatus]);

  const handleMoveToQueue = useCallback((newQueueId: string) => {
    moveToQueue([download.id], newQueueId);
    toast.success("Moved to queue");
  }, [download.id, moveToQueue]);

  const handleSpeedLimitChange = useCallback(async (newLimit: number | null) => {
    // Convert KB/s to bytes/s, 0 means unlimited
    const limitBytes = newLimit === 0 ? 0 : newLimit ? newLimit * 1024 : null;
    
    // Update local state
    updateDownload(download.id, { speed_limit: limitBytes });
    
    // Update backend
    if (isTauri()) {
      try {
        await invoke("update_download", { 
          id: download.id, 
          updates: { speed_limit: limitBytes }
        });
        toast.success(limitBytes === 0 ? "Speed limit disabled" :
                     limitBytes ? `Speed limit set to ${newLimit} KB/s` : "Using queue speed limit");
      } catch (err) {
        console.error("Failed to update speed limit:", err);
      }
    }
  }, [download.id, updateDownload]);

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

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
            onClick={handleRedownload}
            title="Retry"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        );
      case "cancelled":
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-primary hover:bg-primary/10"
            onClick={handleRedownload}
            title="Re-download"
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
          <MenuItem onClick={handleRedownload}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Download
          </MenuItem>
        )}

        {download.status === "cancelled" && (
          <MenuItem onClick={handleRedownload}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Re-download
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

        {/* Select option - enters selection mode */}
        <MenuItem onClick={() => toggleSelected(download.id)}>
          <CheckSquare className="h-4 w-4 mr-2" />
          {isSelected ? "Deselect" : "Select"}
        </MenuItem>

        {/* Remove option */}
        <MenuItem onClick={handleRemove} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Remove
        </MenuItem>
      </>
    );
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-download-item="true"
            draggable={canDrag}
            onDragStart={(e) => handleFileDragStart(e, download)}
            className={cn(
              "rounded-lg border bg-card transition-all group",
              isSelected && "border-primary bg-primary/5",
              isFocused && "ring-2 ring-ring ring-inset",
              canDrag && "cursor-grab active:cursor-grabbing",
            )}
            onClick={() => {
              // ALWAYS set focus when clicking anywhere on the item
              setFocusedId(download.id);
            }}
          >
            {/* Main Row */}
            <div
              className="flex items-center gap-3 p-3 cursor-pointer"
              onClick={(e) => {
                // Don't toggle expand if clicking on checkbox or buttons
                const target = e.target as HTMLElement;
                const isCheckbox = target.closest('.checkbox') || target.closest('[role="checkbox"]');
                const isButton = target.closest('button');
                const isDropdown = target.closest('[data-radix-dropdown-menu-trigger]');

                if (isCheckbox || isButton || isDropdown) return;
                
                // In selection mode, clicking selects/deselects instead of expand/collapse
                // Also support shift-click for range selection
                if (isSelectionMode || e.shiftKey) {
                  toggleSelected(download.id, e.shiftKey);
                } else {
                  // Toggle expand on regular click (not on buttons/checkbox)
                  setIsExpanded(!isExpanded);
                }
              }}
            >
              {/* Expand/Collapse Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleToggleExpand}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>

              {/* Checkbox - only visible in selection mode */}
              {isSelectionMode && (
                <Checkbox
                  className="checkbox"
                  checked={isSelected}
                  onCheckedChange={() => toggleSelected(download.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}

              {/* Queue Color Indicator */}
              {queue && (
                <div
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: queue.color }}
                />
              )}

              {/* File Icon */}
              <div className="shrink-0">
                <StatusIcon status={download.status} />
              </div>

              {/* Main Content */}
              <div className="flex-1 min-w-0 overflow-hidden">
                {/* Filename and Status */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate min-w-0 flex-shrink">{download.filename}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <StatusBadge status={download.status} />
                    {/* MOVED badge for completed downloads where file doesn't exist */}
                    {download.status === "completed" && fileExists === false && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase bg-orange-500/10 text-orange-500">
                        MOVED
                      </span>
                    )}
                    {/* Speed limit indicator */}
                    {effectiveSpeedLimit && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        {Math.round(effectiveSpeedLimit / 1024)} KB/s
                      </span>
                    )}
                    {/* Category badge */}
                    {category && (() => {
                      const iconConfig = getCategoryIcon(category.icon, category.name);
                      const IconComponent = iconConfig.icon;
                      return (
                        <span 
                          className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-medium"
                          style={{ 
                            backgroundColor: `${category.color}15`, 
                            color: category.color 
                          }}
                        >
                          <IconComponent className="h-3 w-3" />
                          {category.name}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Progress Bar (for active downloads) */}
                {(download.status === "downloading" ||
                  download.status === "paused") && (
                  <div className="mt-1.5">
                    {download.size ? (
                      <Progress value={progress} className="h-1.5" />
                    ) : (
                      /* Indeterminate progress bar for unknown size */
                      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div 
                          className={cn(
                            "h-full bg-primary rounded-full",
                            download.status === "downloading" 
                              ? "animate-[indeterminate_1.5s_ease-in-out_infinite]" 
                              : "w-1/4"
                          )}
                          style={download.status === "paused" ? { width: '25%' } : undefined}
                        />
                      </div>
                    )}
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
                      className="h-8 w-8"
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
            </div>

            {/* Expanded Details Panel */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t"
                >
                  <div className="p-3 space-y-3 bg-muted/30">
                    {/* Segments visualization */}
                    {download.segments && download.segments.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Download Segments</Label>
                        <div className="space-y-2">
                          {/* IDM-style single progress bar with segments */}
                          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                            {download.segments.map((segment, idx) => {
                              // Handle unknown size (end = MAX u64 value which shows as huge number)
                              const isUnknownSize = segment.end > Number.MAX_SAFE_INTEGER / 2;
                              const segmentSize = isUnknownSize ? segment.downloaded : (segment.end - segment.start + 1);
                              const segmentProgress = segment.complete 
                                ? 100 
                                : (isUnknownSize 
                                    ? (segment.downloaded > 0 ? 50 : 0) // Show partial progress for unknown size
                                    : (segmentSize > 0 ? (segment.downloaded / segmentSize) * 100 : 0));
                              const segmentWidth = download.size && download.size > 0 && !isUnknownSize
                                ? (segmentSize / download.size) * 100 
                                : 100 / download.segments.length; // Equal width for unknown size
                              
                              // Calculate left position properly for unknown size
                              const leftPosition = isUnknownSize 
                                ? (idx * 100 / download.segments.length)
                                : download.segments.slice(0, idx).reduce((acc, s) => {
                                    const sIsUnknown = s.end > Number.MAX_SAFE_INTEGER / 2;
                                    const sSize = sIsUnknown ? s.downloaded : (s.end - s.start + 1);
                                    return acc + (sSize / (download.size || 1)) * 100;
                                  }, 0);
                              
                              return (
                                <div
                                  key={idx}
                                  className="absolute top-0 h-full"
                                  style={{
                                    left: `${leftPosition}%`,
                                    width: `${segmentWidth}%`,
                                  }}
                                  title={`Segment ${idx + 1}: ${isUnknownSize ? formatBytes(segment.downloaded) : Math.round(segmentProgress) + '%'}`}
                                >
                                  <div
                                    className={cn(
                                      "h-full transition-all duration-300",
                                      segment.complete 
                                        ? "bg-green-500" 
                                        : segment.downloaded > 0 
                                          ? "bg-blue-500" 
                                          : "bg-muted-foreground/20"
                                    )}
                                    style={{ 
                                      width: segment.complete ? '100%' : `${segmentProgress}%`,
                                      backgroundColor: segment.complete 
                                        ? undefined 
                                        : segment.downloaded > 0 
                                          ? undefined 
                                          : 'transparent'
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Segment details */}
                          <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                            {download.segments.map((segment, idx) => {
                              // Handle unknown size (end = MAX u64 value)
                              const isUnknownSize = segment.end > Number.MAX_SAFE_INTEGER / 2;
                              const segmentSize = isUnknownSize ? segment.downloaded : (segment.end - segment.start + 1);
                              const segmentProgress = segment.complete 
                                ? 100
                                : (isUnknownSize 
                                    ? (segment.downloaded > 0 ? 50 : 0)
                                    : (segmentSize > 0 ? (segment.downloaded / segmentSize) * 100 : 0));
                              
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex justify-between">
                                    <span>Seg {idx + 1}:</span>
                                    <span>
                                      {segment.complete 
                                        ? "Complete" 
                                        : isUnknownSize
                                          ? `${formatBytes(segment.downloaded)} (streaming)`
                                          : `${formatBytes(segment.downloaded)}/${formatBytes(segmentSize)}`
                                      }
                                    </span>
                                  </div>
                                  <Progress value={segmentProgress} className="h-1" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Speed limit control */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium flex items-center gap-1">
                          <Gauge className="h-3 w-3" />
                          Speed Limit
                        </Label>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="Unlimited"
                          value={speedLimitInput}
                          onChange={(e) => setSpeedLimitInput(e.target.value)}
                          className="h-8 text-sm"
                          min={0}
                        />
                        <span className="text-xs text-muted-foreground">KB/s</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          onClick={() => {
                            if (speedLimitInput.trim()) {
                              const value = parseInt(speedLimitInput);
                              if (!isNaN(value) && value >= 0) {
                                handleSpeedLimitChange(value > 0 ? value : 0);
                              }
                            } else {
                              handleSpeedLimitChange(0);
                            }
                          }}
                        >
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          onClick={() => handleSpeedLimitChange(0)}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          Unlimited
                        </Button>
                      </div>
                    </div>

                    {/* Additional info */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Queue:</span>{" "}
                        <span className="font-medium">{queue?.name ?? "Unknown"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created:</span>{" "}
                        <span className="font-medium">
                          {new Date(download.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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

      {/* Remove Confirmation Dialog - now using the smart DeleteConfirmDialog */}
      <DeleteConfirmDialog
        open={showRemoveDialog}
        onOpenChange={setShowRemoveDialog}
        download={download}
        onConfirm={async (deleteFile) => {
          setShowRemoveDialog(false);
          
          // Remove from store first
          removeDownload(download.id);
          
          if (isTauri()) {
            try {
              await invoke("delete_download", { id: download.id, delete_file: deleteFile });
              if (deleteFile) {
                toast.success("Download removed and file deleted");
              } else {
                toast.success("Download removed");
              }
            } catch (err) {
              console.error("Failed to delete download:", err);
              toast.error("Failed to remove download");
            }
          } else {
            toast.success("Download removed");
          }
        }}
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
      // Simple spinner - lightweight CSS animation
      return (
        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
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
    deleted: "bg-destructive/10 text-destructive",
  };

  const labels: Record<DownloadStatus, string> = {
    pending: "Pending",
    downloading: "Downloading",
    paused: "Paused",
    completed: "Completed",
    failed: "Failed",
    queued: "Queued",
    cancelled: "Cancelled",
    deleted: "Deleted",
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
