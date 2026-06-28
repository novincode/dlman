import { useRef, useCallback, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
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

// Marquee tuning
const MARQUEE_THRESHOLD = 4; // px of movement before a press becomes a drag-select
const AUTO_SCROLL_EDGE = 56; // px from top/bottom edge where auto-scroll kicks in
const AUTO_SCROLL_MAX = 18; // max px/frame auto-scroll speed

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MarqueeDragState {
  baseSelection: Set<string>; // selection to merge into (existing when shift-drag, else empty)
  startX: number; // content-space coords (include scroll offset)
  startY: number;
  pointerId: number;
  additive: boolean;
  moved: boolean;
  lastClientX: number;
  lastClientY: number;
}

export function DownloadList({ downloads }: DownloadListProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  const focusedId = useDownloadStore((s) => s.focusedId);
  const setFocusedId = useDownloadStore((s) => s.setFocusedId);
  const toggleSelected = useDownloadStore((s) => s.toggleSelected);
  const setSelected = useDownloadStore((s) => s.setSelected);
  const clearSelection = useDownloadStore((s) => s.clearSelection);
  const removeDownload = useDownloadStore((s) => s.removeDownload);

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [downloadToDelete, setDownloadToDelete] = useState<Download | null>(null);

  // Marquee (rubber-band) selection
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const marqueeRef = useRef<MarqueeDragState | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);

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

  // ----- Marquee selection -----------------------------------------------
  // Translate a viewport point into content-space coords (so selection stays
  // correct across scrolling / auto-scroll).
  const getContentPoint = useCallback((clientX: number, clientY: number) => {
    const el = parentRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: clientX - rect.left + el.scrollLeft,
      y: clientY - rect.top + el.scrollTop,
    };
  }, []);

  // Select every item whose row overlaps the vertical band, merged onto `base`.
  const applyMarqueeSelection = useCallback(
    (startY: number, endY: number, base: Set<string>) => {
      const total = virtualizer.getTotalSize();
      const rawMin = Math.min(startY, endY);
      const rawMax = Math.max(startY, endY);
      const selected = new Set(base);

      // Only intersect when the band actually overlaps the content range.
      if (downloads.length > 0 && rawMax >= 0 && rawMin <= total - 1) {
        const min = Math.max(0, rawMin);
        const max = Math.min(total - 1, rawMax);
        const first = virtualizer.getVirtualItemForOffset(min);
        const last = virtualizer.getVirtualItemForOffset(max);
        if (first && last) {
          const lo = Math.min(first.index, last.index);
          const hi = Math.max(first.index, last.index);
          for (let i = lo; i <= hi; i++) {
            const d = downloads[i];
            if (d) selected.add(d.id);
          }
        }
      }

      setSelected(Array.from(selected));
    },
    [virtualizer, downloads, setSelected]
  );

  const updateMarqueeFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const state = marqueeRef.current;
      if (!state) return;
      state.lastClientX = clientX;
      state.lastClientY = clientY;

      const p = getContentPoint(clientX, clientY);
      if (!p) return;

      if (!state.moved) {
        if (
          Math.abs(p.x - state.startX) < MARQUEE_THRESHOLD &&
          Math.abs(p.y - state.startY) < MARQUEE_THRESHOLD
        ) {
          return; // not a drag yet
        }
        state.moved = true;
      }

      setMarqueeRect({
        left: Math.min(state.startX, p.x),
        top: Math.min(state.startY, p.y),
        width: Math.abs(p.x - state.startX),
        height: Math.abs(p.y - state.startY),
      });
      applyMarqueeSelection(state.startY, p.y, state.baseSelection);
    },
    [getContentPoint, applyMarqueeSelection]
  );

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const ensureAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) return;
    const tick = () => {
      const el = parentRef.current;
      const state = marqueeRef.current;
      if (!el || !state) {
        autoScrollRafRef.current = null;
        return;
      }
      const rect = el.getBoundingClientRect();
      const y = state.lastClientY;
      let delta = 0;
      if (y < rect.top + AUTO_SCROLL_EDGE) {
        delta = -Math.ceil(((rect.top + AUTO_SCROLL_EDGE - y) / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX);
      } else if (y > rect.bottom - AUTO_SCROLL_EDGE) {
        delta = Math.ceil(((y - (rect.bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX);
      }
      if (delta !== 0) {
        const maxScroll = el.scrollHeight - el.clientHeight;
        const before = el.scrollTop;
        el.scrollTop = Math.max(0, Math.min(maxScroll, el.scrollTop + delta));
        if (el.scrollTop !== before) {
          updateMarqueeFromClient(state.lastClientX, state.lastClientY);
        }
      }
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, [updateMarqueeFromClient]);

  const endMarquee = useCallback(() => {
    const state = marqueeRef.current;
    marqueeRef.current = null;
    stopAutoScroll();
    setMarqueeRect(null);
    if (state) {
      try {
        parentRef.current?.releasePointerCapture(state.pointerId);
      } catch {
        // capture may already be gone
      }
    }
    return state;
  }, [stopAutoScroll]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Primary button only.
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Presses on an item (drag-to-queue / click) or any interactive control
      // are not marquee starts — only empty list space is.
      if (target.closest('[data-download-item]')) return;
      if (
        target.closest(
          'button, a, input, textarea, [role="checkbox"], [role="menuitem"], [data-radix-popper-content-wrapper]'
        )
      ) {
        return;
      }

      const p = getContentPoint(e.clientX, e.clientY);
      if (!p) return;

      const additive = e.shiftKey;
      marqueeRef.current = {
        baseSelection: additive
          ? new Set(useDownloadStore.getState().selectedIds)
          : new Set<string>(),
        startX: p.x,
        startY: p.y,
        pointerId: e.pointerId,
        additive,
        moved: false,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      try {
        parentRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      ensureAutoScroll();
    },
    [getContentPoint, ensureAutoScroll]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!marqueeRef.current) return;
      updateMarqueeFromClient(e.clientX, e.clientY);
      if (marqueeRef.current?.moved) e.preventDefault();
    },
    [updateMarqueeFromClient]
  );

  const handlePointerUp = useCallback(() => {
    const state = endMarquee();
    if (!state) return;
    // A plain click on empty space (no drag) clears the selection — unless the
    // user was holding shift to keep/extend it.
    if (!state.moved && !state.additive) {
      clearSelection();
    }
  }, [endMarquee, clearSelection]);

  const handlePointerCancel = useCallback(() => {
    endMarquee();
  }, [endMarquee]);

  // Clean up any running auto-scroll on unmount.
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (downloads.length === 0) return;

      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Ctrl/Cmd+A selects everything in the current view.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(downloads.map((d) => d.id));
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        clearSelection();
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
    [downloads, focusedId, focusedIndex, setFocusedId, toggleSelected, setSelected, clearSelection]
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
        await invoke("delete_download", { id: downloadToDelete.id, delete_file: deleteFile });
        if (deleteFile) {
          toast.success(t('toasts.downloadRemovedWithFile'));
        } else {
          toast.success(t('toasts.downloadRemoved'));
        }
      } catch (err) {
        console.error("Failed to delete download:", err);
        toast.error(t('toasts.removeFailed'));
      }
    } else {
      toast.success(t('toasts.downloadRemoved'));
    }

    setDownloadToDelete(null);
  }, [downloadToDelete, removeDownload, t]);

  return (
    <>
      <div
        ref={parentRef}
        className="h-full overflow-auto focus:outline-none p-2 select-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
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

          {/* Rubber-band selection rectangle (content-space coords) */}
          {marqueeRect && (
            <div
              className="pointer-events-none absolute z-20 rounded-sm border border-primary bg-primary/10"
              style={{
                left: `${marqueeRect.left}px`,
                top: `${marqueeRect.top}px`,
                width: `${marqueeRect.width}px`,
                height: `${marqueeRect.height}px`,
              }}
            />
          )}
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
