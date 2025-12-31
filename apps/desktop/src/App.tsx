import { useEffect, useCallback } from "react";
import { Toaster } from "sonner";
import { homeDir } from "@tauri-apps/api/path";
import { Layout } from "@/components/layout/Layout";
import {
  NewDownloadDialog,
  BatchImportDialog,
  SettingsDialog,
  QueueManagerDialog,
  AboutDialog,
  ConfirmDialog,
} from "@/components/dialogs";
import { DropZoneOverlay } from "@/components/DropZoneOverlay";
import { ContextMenuProvider } from "@/components/ContextMenu";
import { DndProvider } from "@/components/dnd/DndProvider";
import { useSettingsStore } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { setupEventListeners, setPendingClipboardUrls } from "@/lib/events";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { parseUrls } from "@/lib/utils";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

function AppContent() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const defaultDownloadPath = useSettingsStore((s) => s.settings.defaultDownloadPath);
  const setDefaultDownloadPath = useSettingsStore((s) => s.setDefaultDownloadPath);
  const { setShowNewDownloadDialog, setShowBatchImportDialog } = useUIStore();

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

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

  // Set up Tauri event listeners
  useEffect(() => {
    const cleanup = setupEventListeners();
    return cleanup;
  }, []);

  // Handle paste for links
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't intercept if pasting into an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      const text = e.clipboardData?.getData("text");
      if (!text) return;
      
      const urls = parseUrls(text);
      if (urls.length === 0) return;
      
      // Prevent default paste behavior
      e.preventDefault();
      
      // Store URLs for dialogs to use
      setPendingClipboardUrls(urls);
      
      if (urls.length === 1) {
        // Single URL - open new download dialog
        setShowNewDownloadDialog(true);
      } else {
        // Multiple URLs - open batch import dialog
        setShowBatchImportDialog(true);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [setShowNewDownloadDialog, setShowBatchImportDialog]);

  // Handle dropped URLs from DropZoneOverlay
  const handleDrop = useCallback((urls: string[]) => {
    if (urls.length === 0) return;

    // Store URLs for dialogs to pick up (same as paste handler)
    setPendingClipboardUrls(urls);

    if (urls.length === 1) {
      // Single URL - open new download dialog
      setShowNewDownloadDialog(true);
    } else if (urls.length > 1) {
      // Multiple URLs - open batch import dialog
      setShowBatchImportDialog(true);
    }
  }, [setShowNewDownloadDialog, setShowBatchImportDialog]);

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
      
      <Toaster
        theme={theme === "system" ? undefined : theme}
        position="bottom-right"
        richColors
        closeButton
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
