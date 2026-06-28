import { useEffect, useCallback, useState } from "react";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { Layout } from "@/components/layout/Layout";
import {
  NewDownloadDialog,
  BatchImportDialog,
  SettingsDialog,
  QueueManagerDialog,
  AboutDialog,
  ConfirmDialog,
  BulkDeleteConfirmDialog,
  CredentialPromptDialog,
} from "@/components/dialogs";
import { DropZoneOverlay } from "@/components/DropZoneOverlay";
import { ContextMenuProvider } from "@/components/ContextMenu";
import { DndProvider } from "@/components/dnd/DndProvider";
import { SupportReminder } from "@/components/SupportReminder";
import { useSettingsStore, loadSettingsFromBackend } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { useDownloadStore } from "@/stores/downloads";
import { loadCredentialsFromBackend } from "@/stores/credentials";
import { setupEventListeners } from "@/lib/events";
import { ingestDroppedUrls, ingestPastedUrls, extractUrlsFromDataTransfer } from "@/lib/url-intake";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useApplyLocale } from "@/i18n/useApplyLocale";
import { useTranslation } from "react-i18next";
import { initSystemIntegrations } from "@/lib/system-tray";
import { initNotifications } from "@/lib/notifications";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

function AppContent() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const defaultDownloadPath = useSettingsStore((s) => s.settings.default_download_path);
  const setDefaultDownloadPath = useSettingsStore((s) => s.setDefaultDownloadPath);
  const { showBulkDeleteDialog, setShowBulkDeleteDialog } = useUIStore();
  const { selectedIds, downloads, removeDownload, clearSelection } = useDownloadStore();
  const [actualTheme, setActualTheme] = useState<"light" | "dark">("light");
  const { t } = useTranslation();

  // Get selected downloads for bulk delete dialog
  const selectedDownloads = Array.from(selectedIds)
    .map(id => downloads.get(id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  // Handle bulk delete confirmation
  const handleConfirmBulkDelete = useCallback(async (deleteFiles: boolean) => {
    setShowBulkDeleteDialog(false);
    
    const ids = Array.from(selectedIds);
    let successCount = 0;
    let fileDeleteCount = 0;
    
    for (const id of ids) {
      const download = downloads.get(id);
      if (!download) continue;
      
      // Remove from store first
      removeDownload(id);
      
      if (isTauri()) {
        try {
          // Only delete file for completed downloads if user requested
          const shouldDeleteFile = deleteFiles && download.status === 'completed';
          await invoke('delete_download', { id, delete_file: shouldDeleteFile });
          successCount++;
          if (shouldDeleteFile) fileDeleteCount++;
        } catch (err) {
          console.error(`Failed to delete download ${id}:`, err);
        }
      } else {
        successCount++;
      }
    }
    
    clearSelection();
    
    if (fileDeleteCount > 0) {
      toast.success(t('toasts.bulkRemovedWithFiles', { n: successCount, files: fileDeleteCount }));
    } else {
      toast.success(t('toasts.bulkRemoved', { n: successCount }));
    }
  }, [selectedIds, downloads, removeDownload, clearSelection, setShowBulkDeleteDialog, t]);

  // Determine actual theme for Sonner (system theme needs real detection)
  const getActualTheme = useCallback((): "light" | "dark" => {
    if (theme !== "system") {
      return theme as "light" | "dark";
    }
    // Detect system theme preference
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  }, [theme]);

  // Apply the persisted language, text direction, and font (and react to changes)
  useApplyLocale();

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  // Check for app updates on startup
  useUpdateCheck();

  // Initialize system tray, native menu, and window close handler
  useEffect(() => {
    if (isTauri()) {
      initSystemIntegrations().catch(console.error);
      initNotifications().catch(console.error);
    }
  }, []);

  // Handle system theme changes
  useEffect(() => {
    setActualTheme(getActualTheme());
    
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        setActualTheme(getActualTheme());
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme, getActualTheme]);

  // Resolve default download path on startup
  useEffect(() => {
    const resolveDefaultPath = async () => {
      if (isTauri() && defaultDownloadPath.startsWith('~')) {
        try {
          const home = await homeDir();
          const resolvedPath = defaultDownloadPath.replace('~', home);
          setDefaultDownloadPath(resolvedPath);
        } catch (err) {
          console.error('Failed to resolve home directory:', err);
        }
      }
    };
    
    resolveDefaultPath();
  }, [defaultDownloadPath, setDefaultDownloadPath]);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }

    localStorage.setItem("dlman-theme", theme);
  }, [theme]);

  // Load settings from backend (SQLite - single source of truth)
  useEffect(() => {
    // Load settings from SQLite on startup - this is the single source of truth
    loadSettingsFromBackend().catch(console.error);
    // Load saved credentials
    loadCredentialsFromBackend().catch(console.error);
  }, []);

  // Set up Tauri event listeners
  useEffect(() => {
    const cleanup = setupEventListeners();
    
    // Listen for deep link events from browser extension
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<string>('set-download-url', (event) => {
          // Route through the shared intake so it opens (or re-fills) the dialog.
          ingestPastedUrls([event.payload]);
        }).then((unlistenFn) => {
          unlisten = unlistenFn;
        }).catch(console.error);
      }).catch(console.error);
    }
    
    return () => {
      cleanup();
      if (unlisten) unlisten();
    };
  }, []);

  // Handle paste for links
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't intercept if pasting into an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      // Extract from the full clipboard payload (uri-list + plain text + HTML
      // anchor hrefs) — not just plain text. This is the reliable way to import
      // a multi-link selection (e.g. a GitHub release list, where the links live
      // in anchor hrefs): the clipboard keeps absolutized HTML even when a drag
      // would only carry plain text.
      const urls = extractUrlsFromDataTransfer(e.clipboardData);
      if (urls.length === 0) return;

      // Prevent default paste behavior, then route through the shared intake.
      e.preventDefault();
      ingestPastedUrls(urls);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Handle dropped URLs from DropZoneOverlay (routing + empty-drop feedback live
  // in the shared intake pipeline).
  const handleDrop = useCallback((urls: string[]) => {
    ingestDroppedUrls(urls);
  }, []);

  return (
    <div>
      <Layout />
      
      {/* Drop Zone Overlay */}
      <DropZoneOverlay onDrop={handleDrop} />
      
      {/* Dialogs */}
      <NewDownloadDialog />
      <BatchImportDialog />
      <SettingsDialog />
      <QueueManagerDialog />
      <AboutDialog />
      <ConfirmDialog />
      <CredentialPromptDialog />
      <BulkDeleteConfirmDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
        downloads={selectedDownloads}
        onConfirm={handleConfirmBulkDelete}
      />
      
      {/* Support Reminder */}
      <SupportReminder />
      
      <Toaster
        theme={actualTheme}
        position="bottom-right"
        richColors
        closeButton
        duration={3000}
        toastOptions={{
          className: 'text-sm',
        }}
      />
    </div>
  );
}

function App() {
  return (
    <ContextMenuProvider>
      <DndProvider>
        <AppContent />
      </DndProvider>
    </ContextMenuProvider>
  );
}

export default App;
