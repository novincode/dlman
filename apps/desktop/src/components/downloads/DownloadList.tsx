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
    estimateSize: () => 80, // Base height estimate
    overscan: 5,
    // Enable dynamic sizing based on measured elements
    measureElement: (element) => {
      return element.getBoundingClientRect().height;
    },
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
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full px-4 py-1"
              style={{
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
