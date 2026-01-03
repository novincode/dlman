import { useMemo } from "react";
import { Activity } from "lucide-react";
import { useDownloadStore, selectFilteredDownloads } from "@/stores/downloads";
import { useShallow } from "zustand/react/shallow";
import { formatSpeed } from "@/lib/utils";

export function NetworkStats() {
  // Use the same filtered selector; we just want current download speeds.
  const downloads = useDownloadStore(useShallow(selectFilteredDownloads));

  const totalSpeed = useMemo(() => {
    return downloads.reduce((sum, d) => sum + (d.speed ?? 0), 0);
  }, [downloads]);

  return (
    <div className="border-t bg-card/50 px-3 py-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <span>Network</span>
        </div>
        <span className="font-medium text-foreground">{formatSpeed(totalSpeed)}</span>
      </div>
    </div>
  );
}
