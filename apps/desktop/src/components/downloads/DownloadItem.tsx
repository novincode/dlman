import { motion } from "framer-motion";
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
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDownloadStore } from "@/stores/downloads";
import { useQueueStore } from "@/stores/queues";
import { formatBytes, formatSpeed, formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Download, DownloadStatus } from "@/types";

interface DownloadItemProps {
  download: Download & { speed?: number; eta?: number | null };
}

export function DownloadItem({ download }: DownloadItemProps) {
  const { selectedIds, toggleSelected } = useDownloadStore();
  const isSelected = selectedIds.has(download.id);
  const queue = useQueueStore((s) => s.queues.get(download.queue_id));

  const progress = download.size
    ? (download.downloaded / download.size) * 100
    : 0;

  return (
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

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Pause/Resume for active */}
            {(download.status === "downloading" ||
              download.status === "paused") && (
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {download.status === "paused" ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Retry for failed */}
            {download.status === "failed" && (
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Play className="h-4 w-4" />
              </Button>
            )}

            {/* More options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {download.status === "completed" && (
                  <>
                    <DropdownMenuItem>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open File
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Open Folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem>Copy URL</DropdownMenuItem>
                <DropdownMenuItem>Move to Queue</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove from List
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete File
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </motion.div>
      </ContextMenuTrigger>

      {/* Context Menu */}
      <ContextMenuContent>
        {download.status === "completed" && (
          <>
            <ContextMenuItem>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open File
            </ContextMenuItem>
            <ContextMenuItem>
              <FolderOpen className="h-4 w-4 mr-2" />
              Open Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {download.status === "downloading" && (
          <ContextMenuItem>
            <Pause className="h-4 w-4 mr-2" />
            Pause
          </ContextMenuItem>
        )}
        {download.status === "paused" && (
          <ContextMenuItem>
            <Play className="h-4 w-4 mr-2" />
            Resume
          </ContextMenuItem>
        )}
        {download.status === "failed" && (
          <ContextMenuItem>
            <Play className="h-4 w-4 mr-2" />
            Retry
          </ContextMenuItem>
        )}
        <ContextMenuItem>Copy URL</ContextMenuItem>
        <ContextMenuItem>Move to Queue</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive">
          Remove from List
        </ContextMenuItem>
        <ContextMenuItem className="text-destructive">
          Delete File
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function StatusIcon({ status }: { status: DownloadStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-8 w-8 text-success" />;
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
    completed: "bg-success/10 text-success",
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
