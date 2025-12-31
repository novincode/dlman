import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DraggableDownloadItem } from "@/components/dnd/DraggableDownloadItem";
import { DownloadItem } from "@/components/downloads/DownloadItem";
import type { Download } from "@/types";

interface DownloadListProps {
  downloads: Download[];
}

export function DownloadList({ downloads }: DownloadListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: downloads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
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
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const download = downloads[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <DraggableDownloadItem id={download.id} data={download}>
                <DownloadItem download={download} />
              </DraggableDownloadItem>
            </div>
          );
        })}
      </div>
    </div>
  );
}
