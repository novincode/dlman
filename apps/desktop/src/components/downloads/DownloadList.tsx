import { useRef, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DraggableDownloadItem } from "@/components/dnd/DraggableDownloadItem";
import { DownloadItem } from "@/components/downloads/DownloadItem";
import { useDownloadStore } from "@/stores/downloads";
import type { Download } from "@/types";

interface DownloadListProps {
  downloads: Download[];
}

export function DownloadList({ downloads }: DownloadListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const focusedId = useDownloadStore((s) => s.focusedId);
  const setFocusedId = useDownloadStore((s) => s.setFocusedId);
  const toggleSelected = useDownloadStore((s) => s.toggleSelected);

  const virtualizer = useVirtualizer({
    count: downloads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
    measureElement: (element) => {
      return element.getBoundingClientRect().height;
    },
  });

  // Get focused index
  const focusedIndex = focusedId ? downloads.findIndex((d) => d.id === focusedId) : -1;

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      virtualizer.scrollToIndex(focusedIndex, { align: "auto" });
    }
  }, [focusedIndex, virtualizer]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (downloads.length === 0) return;

      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const currentIndex = focusedIndex >= 0 ? focusedIndex : -1;
        const nextIndex = Math.min(currentIndex + 1, downloads.length - 1);
        setFocusedId(downloads[nextIndex].id);
        
        // If shift is held, also select the item
        if (e.shiftKey && downloads[nextIndex]) {
          toggleSelected(downloads[nextIndex].id, true);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = focusedIndex >= 0 ? focusedIndex : downloads.length;
        const prevIndex = Math.max(currentIndex - 1, 0);
        setFocusedId(downloads[prevIndex].id);
        
        // If shift is held, also select the item
        if (e.shiftKey && downloads[prevIndex]) {
          toggleSelected(downloads[prevIndex].id, true);
        }
      } else if (e.key === " " || e.key === "Space") {
        e.preventDefault();
        // Toggle selection of focused item
        if (focusedId) {
          toggleSelected(focusedId, e.shiftKey);
        } else if (downloads.length > 0) {
          // If no focused item, focus and toggle the first one
          setFocusedId(downloads[0].id);
          toggleSelected(downloads[0].id, false);
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        if (downloads.length > 0) {
          setFocusedId(downloads[0].id);
        }
      } else if (e.key === "End") {
        e.preventDefault();
        if (downloads.length > 0) {
          setFocusedId(downloads[downloads.length - 1].id);
        }
      }
    },
    [downloads, focusedId, focusedIndex, setFocusedId, toggleSelected]
  );

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const download = downloads[virtualItem.index];
          const isFocused = download.id === focusedId;
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
                <DownloadItem download={download} isFocused={isFocused} />
              </DraggableDownloadItem>
            </div>
          );
        })}
      </div>
    </div>
  );
}
