import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, Pause, Play, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useDownloadStore } from "@/stores/downloads";
import { formatSpeed, cn } from "@/lib/utils";
import type { DownloadStatus } from "@/types";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

export function ActiveDownloads() {
  const [expanded, setExpanded] = useState(true);
  const downloads = useDownloadStore((s) => s.downloads);
  const updateStatus = useDownloadStore((s) => s.updateStatus);
  
  const activeDownloads = useMemo(() => 
    Array.from(downloads.values()).filter(
      (d) => d.status === "downloading" || d.status === "paused"
    ),
    [downloads]
  );

  if (activeDownloads.length === 0) {
    return null;
  }

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 w-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Download className="h-3 w-3 mr-1" />
        ACTIVE
        <span className="ml-auto text-xs opacity-60">{activeDownloads.length}</span>
      </button>

      {/* Active Downloads */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-1">
              {activeDownloads.map((download) => (
                <ActiveDownloadItem
                  key={download.id}
                  id={download.id}
                  filename={download.filename}
                  progress={
                    download.size
                      ? (download.downloaded / download.size) * 100
                      : 0
                  }
                  speed={download.speed || 0}
                  isPaused={download.status === "paused"}
                  updateStatus={updateStatus}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ActiveDownloadItemProps {
  id: string;
  filename: string;
  progress: number;
  speed: number;
  isPaused: boolean;
  updateStatus: (id: string, status: DownloadStatus, error: string | null) => void;
}

function ActiveDownloadItem({
  id,
  filename,
  progress,
  speed,
  isPaused,
  updateStatus,
}: ActiveDownloadItemProps) {
  const handlePauseResume = useCallback(async () => {
    if (isPaused) {
      // Resume
      updateStatus(id, "downloading", null);
      if (isTauri()) {
        try {
          await invoke("resume_download", { id });
          toast.success("Download resumed");
        } catch (err) {
          console.error("Failed to resume:", err);
          updateStatus(id, "paused", null);
          toast.error("Failed to resume download");
        }
      }
    } else {
      // Pause
      updateStatus(id, "paused", null);
      if (isTauri()) {
        try {
          await invoke("pause_download", { id });
          toast.success("Download paused");
        } catch (err) {
          console.error("Failed to pause:", err);
          updateStatus(id, "downloading", null);
          toast.error("Failed to pause download");
        }
      }
    }
  }, [id, isPaused, updateStatus]);

  const handleCancel = useCallback(async () => {
    updateStatus(id, "cancelled", null);
    
    if (isTauri()) {
      try {
        await invoke("cancel_download", { id });
        toast.success("Download cancelled");
      } catch (err) {
        console.error("Failed to cancel:", err);
        toast.error("Failed to cancel download");
      }
    }
  }, [id, updateStatus]);

  return (
    <div className="px-2 py-1.5 rounded-md bg-card border group">
      {/* Filename */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs truncate flex-1">{filename}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-5 w-5"
            onClick={handlePauseResume}
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? (
              <Play className="h-3 w-3" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-5 w-5"
            onClick={handleCancel}
            title="Cancel"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <Progress value={progress} className="h-1" />

      {/* Stats */}
      <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
        <span>{Math.round(progress)}%</span>
        <span className={cn(isPaused && "text-yellow-500")}>
          {isPaused ? "Paused" : formatSpeed(speed)}
        </span>
      </div>
    </div>
  );
}
