import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DownloadItem } from "./DownloadItem";
import type { Download } from "@/types";

interface DownloadListProps {
  downloads: Download[];
}

export function DownloadList({ downloads }: DownloadListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: downloads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const download = downloads[virtualRow.index];
          return (
            <div
              key={download.id}
              className="absolute top-0 left-0 w-full px-4"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <DownloadItem download={download} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
