import { useEffect, useCallback } from "react";
import { useUIStore } from "@/stores/ui";
import { useDownloadStore, useFilteredDownloads } from "@/stores/downloads";
import { parseUrls } from "@/lib/utils";
import { setPendingClipboardUrls } from "@/lib/events";

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
  } = useUIStore();

  const { selectAll, clearSelection } = useDownloadStore();
  const filteredDownloads = useFilteredDownloads();

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
    // Queue manager (Shift+Cmd+Q to avoid conflict with macOS Quit)
    {
      key: "q",
      metaKey: true,
      shiftKey: true,
      action: () => setShowQueueManagerDialog(true),
      description: "Queue Manager",
    },
    // Select all (only filtered downloads)
    {
      key: "a",
      metaKey: true,
      action: () => selectAll(filteredDownloads.map(d => d.id)),
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
