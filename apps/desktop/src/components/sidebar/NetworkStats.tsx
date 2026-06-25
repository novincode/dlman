import { useMemo } from "react";
import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDownloadStore } from "@/stores/downloads";
import { formatSpeed } from "@/lib/utils";

export function NetworkStats() {
  const { t } = useTranslation();
  // Get all downloads and calculate total speed only from actively downloading items
  const downloads = useDownloadStore((s) => s.downloads);

  const totalSpeed = useMemo(() => {
    let speed = 0;
    for (const d of downloads.values()) {
      // Only count speed from actively downloading items
      if (d.status === "downloading" && typeof d.speed === "number") {
        speed += d.speed;
      }
    }
    return speed;
  }, [downloads]);

  return (
    <div className="border-t bg-card/50 px-3 py-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <span>{t('sidebar.network')}</span>
        </div>
        <span className="font-medium text-foreground">{formatSpeed(totalSpeed)}</span>
      </div>
    </div>
  );
}
