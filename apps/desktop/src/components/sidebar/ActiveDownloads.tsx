import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Download, Pause, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useDownloadStore } from "@/stores/downloads";
import { formatSpeed, cn } from "@/lib/utils";

export function ActiveDownloads() {
  const [expanded, setExpanded] = useState(true);
  const downloads = useDownloadStore((s) =>
    Array.from(s.downloads.values()).filter(
      (d) => d.status === "downloading" || d.status === "paused"
    )
  );

  if (downloads.length === 0) {
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
        <span className="ml-auto text-xs opacity-60">{downloads.length}</span>
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
              {downloads.map((download) => (
                <ActiveDownloadItem
                  key={download.id}
                  filename={download.filename}
                  progress={
                    download.size
                      ? (download.downloaded / download.size) * 100
                      : 0
                  }
                  speed={download.speed || 0}
                  isPaused={download.status === "paused"}
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
  filename: string;
  progress: number;
  speed: number;
  isPaused: boolean;
}

function ActiveDownloadItem({
  filename,
  progress,
  speed,
  isPaused,
}: ActiveDownloadItemProps) {
  return (
    <div className="px-2 py-1.5 rounded-md bg-card border group">
      {/* Filename */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs truncate flex-1">{filename}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-5 w-5">
            {isPaused ? (
              <Download className="h-3 w-3" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5">
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
