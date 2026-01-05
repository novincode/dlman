import { useRef, useCallback, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { DraggableDownloadItem } from "@/components/dnd/DraggableDownloadItem";
import { DownloadItem } from "@/components/downloads/DownloadItem";
import { useDownloadStore } from "@/stores/downloads";
import { DeleteConfirmDialog } from "@/components/dialogs/DeleteConfirmDialog";
import type { Download } from "@/types";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

interface DownloadListProps {
  downloads: Download[];
}

export function DownloadList({ downloads }: DownloadListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const focusedId = useDownloadStore((s) => s.focusedId);
  const setFocusedId = useDownloadStore((s) => s.setFocusedId);
  const toggleSelected = useDownloadStore((s) => s.toggleSelected);
  const removeDownload = useDownloadStore((s) => s.removeDownload);

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [downloadToDelete, setDownloadToDelete] = useState<Download | null>(null);

  const virtualizer = useVirtualizer({
    count: downloads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 84, // Slightly larger to account for gap
    overscan: 5,
    gap: 6, // Small gap between items
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
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        // Delete focused item
        if (focusedId) {
          const download = downloads.find((d) => d.id === focusedId);
          if (download) {
            setDownloadToDelete(download);
            setShowDeleteDialog(true);
          }
        }
      }
    },
    [downloads, focusedId, focusedIndex, setFocusedId, toggleSelected]
  );

  // Handle delete confirmation
  const handleConfirmDelete = useCallback(async (deleteFile: boolean) => {
    if (!downloadToDelete) return;
    
    setShowDeleteDialog(false);
    
    // Remove from store first
    removeDownload(downloadToDelete.id);
    
    if (isTauri()) {
      try {
        // If user chose to also delete the file, use delete_file: true
        await invoke("delete_download", { id: downloadToDelete.id, deleteFile });
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
    
    setDownloadToDelete(null);
  }, [downloadToDelete, removeDownload]);

  return (
    <>
      <div
        ref={parentRef}
        className="h-full overflow-auto focus:outline-none p-2"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div
          className="relative w-full min-w-0"
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
                className="absolute top-0 left-0 w-full min-w-0"
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
      
      {/* Delete Confirmation Dialog */}
      {downloadToDelete && (
        <DeleteConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          download={downloadToDelete}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
