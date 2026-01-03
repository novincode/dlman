import { useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useUIStore } from "@/stores/ui";
import { useDownloadStore, selectFilteredDownloads } from "@/stores/downloads";
import { useQueueStore } from "@/stores/queues";
import { useCategoryStore } from "@/stores/categories";
import { useShallow } from "zustand/react/shallow";
import { parseUrls } from "@/lib/utils";
import { setPendingClipboardUrls } from "@/lib/events";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

interface KeyboardShortcut {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts() {
  const {
    setShowNewDownloadDialog,
    setShowBatchImportDialog,
    setShowSettingsDialog,
    setShowQueueManagerDialog,
    openConfirmDialog,
  } = useUIStore();

  const { selectAll, clearSelection, selectedIds, removeDownload } = useDownloadStore();
  const baseFilteredDownloads = useDownloadStore(useShallow(selectFilteredDownloads));
  
  // Get selected queue and category to filter downloads the same way MainContent does
  const selectedQueueId = useQueueStore((s) => s.selectedQueueId);
  const selectedCategoryId = useCategoryStore((s) => s.selectedCategoryId);
  
  // Apply same filtering as MainContent - visible downloads only
  const visibleDownloads = useMemo(() => {
    let filtered = baseFilteredDownloads;

    // Filter by queue
    if (selectedQueueId !== null) {
      filtered = filtered.filter((d) => d.queue_id === selectedQueueId);
    }

    // Filter by category
    if (selectedCategoryId !== null) {
      filtered = filtered.filter((d) => d.category_id === selectedCategoryId);
    }

    return filtered;
  }, [baseFilteredDownloads, selectedQueueId, selectedCategoryId]);

  const shortcuts: KeyboardShortcut[] = [
    // New download
    {
      key: "n",
      metaKey: true,
      action: () => setShowNewDownloadDialog(true),
      description: "New Download",
    },
    // Batch import
    {
      key: "i",
      metaKey: true,
      shiftKey: true,
      action: () => setShowBatchImportDialog(true),
      description: "Batch Import",
    },
    // Settings
    {
      key: ",",
      metaKey: true,
      action: () => setShowSettingsDialog(true),
      description: "Settings",
    },
    // Queue manager (Cmd+J for Jobs/Queue)
    {
      key: "j",
      metaKey: true,
      action: () => setShowQueueManagerDialog(true),
      description: "Queue Manager",
    },
    // Select all (only visible downloads - respects queue/category/filter selection)
    {
      key: "a",
      metaKey: true,
      action: () => selectAll(visibleDownloads.map(d => d.id)),
      description: "Select All",
    },
    // Deselect all
    {
      key: "Escape",
      action: () => clearSelection(),
      description: "Clear Selection",
    },
    // Paste from clipboard
    {
      key: "v",
      metaKey: true,
      action: async () => {
        try {
          const text = await navigator.clipboard.readText();
          const urls = parseUrls(text);
          if (urls.length === 0) return;
          
          setPendingClipboardUrls(urls);
          if (urls.length === 1) {
            setShowNewDownloadDialog(true);
          } else {
            setShowBatchImportDialog(true);
          }
        } catch (err) {
          console.error("Clipboard read failed:", err);
        }
      },
      description: "Paste URL",
    },
    // Delete selected downloads
    {
      key: "Delete",
      action: () => {
        if (selectedIds.size === 0) return;
        
        openConfirmDialog({
          title: 'Delete Downloads',
          description: `Are you sure you want to remove ${selectedIds.size} download(s) from the list? This will not delete the files.`,
          confirmLabel: 'Remove',
          variant: 'destructive',
          onConfirm: async () => {
            const ids = Array.from(selectedIds);
            for (const id of ids) {
              removeDownload(id);
              
              if (isTauri()) {
                try {
                  await invoke('delete_download', { id, delete_file: false });
                } catch (err) {
                  console.error(`Failed to delete download ${id}:`, err);
                }
              }
            }
            clearSelection();
            toast.success(`Removed ${ids.length} download(s)`);
          },
        });
      },
      description: "Delete Selected",
    },
    // Also support Backspace for delete
    {
      key: "Backspace",
      action: () => {
        if (selectedIds.size === 0) return;
        
        openConfirmDialog({
          title: 'Delete Downloads',
          description: `Are you sure you want to remove ${selectedIds.size} download(s) from the list? This will not delete the files.`,
          confirmLabel: 'Remove',
          variant: 'destructive',
          onConfirm: async () => {
            const ids = Array.from(selectedIds);
            for (const id of ids) {
              removeDownload(id);
              
              if (isTauri()) {
                try {
                  await invoke('delete_download', { id, delete_file: false });
                } catch (err) {
                  console.error(`Failed to delete download ${id}:`, err);
                }
              }
            }
            clearSelection();
            toast.success(`Removed ${ids.length} download(s)`);
          },
        });
      },
      description: "Delete Selected",
    },
  ];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcuts) {
        const shiftMatch = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.altKey ? e.altKey : !e.altKey;

        // Special handling for meta key shortcuts - they should match Cmd on Mac, Ctrl on Windows
        const modifierMatch = shortcut.metaKey
          ? e.metaKey || e.ctrlKey
          : !e.metaKey && !e.ctrlKey;

        if (
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          modifierMatch &&
          shiftMatch &&
          altMatch
        ) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return shortcuts;
}

// Component to display shortcuts help
export function KeyboardShortcutsHelp() {
  const shortcuts = [
    { keys: "⌘N", description: "New Download" },
    { keys: "⌘⇧I", description: "Batch Import" },
    { keys: "⌘,", description: "Settings" },
    { keys: "⌘⇧Q", description: "Queue Manager" },
    { keys: "⌘A", description: "Select All" },
    { keys: "Esc", description: "Clear Selection" },
    { keys: "⌘V", description: "Paste URL" },
  ];

  return (
    <div className="space-y-2">
      {shortcuts.map(({ keys, description }) => (
        <div key={keys} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{description}</span>
          <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{keys}</kbd>
        </div>
      ))}
    </div>
  );
}
