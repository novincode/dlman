import { useEffect, useCallback } from "react";
import { Toaster } from "sonner";
import { Layout } from "@/components/layout/Layout";
import {
  NewDownloadDialog,
  BatchImportDialog,
  SettingsDialog,
  QueueManagerDialog,
} from "@/components/dialogs";
import { DropZoneOverlay } from "@/components/DropZoneOverlay";
import { ContextMenuProvider, useGlobalContextMenu } from "@/components/ContextMenu";
import { useSettingsStore } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { setupEventListeners } from "@/lib/events";

function AppContent() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const devMode = useSettingsStore((s) => s.settings.devMode);
  const { setShowNewDownloadDialog, setShowBatchImportDialog, showDevConsole } = useUIStore();
  
  const handleGlobalContextMenu = useGlobalContextMenu();

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
      const text = e.clipboardData?.getData("text");
      if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
        // Open new download dialog with pasted URL
        setShowNewDownloadDialog(true);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [setShowNewDownloadDialog]);

  // Handle dropped URLs from DropZoneOverlay
  const handleDrop = useCallback((urls: string[]) => {
    if (urls.length === 1) {
      // Single URL - open new download dialog
      setShowNewDownloadDialog(true);
    } else if (urls.length > 1) {
      // Multiple URLs - open batch import dialog
      setShowBatchImportDialog(true);
    }
  }, [setShowNewDownloadDialog, setShowBatchImportDialog]);

  return (
    <div onContextMenu={handleGlobalContextMenu}>
      <Layout />
      
      {/* Drop Zone Overlay */}
      <DropZoneOverlay onDrop={handleDrop} />
      
      {/* Dialogs */}
      <NewDownloadDialog />
      <BatchImportDialog />
      <SettingsDialog />
      <QueueManagerDialog />
      
      <Toaster
        theme={theme === "system" ? undefined : theme}
        position="bottom-right"
        richColors
        closeButton
      />
      {devMode && showDevConsole && (
        <div className="fixed bottom-0 left-0 right-0 h-48 bg-card border-t border-border overflow-auto font-mono text-xs p-2">
          <div className="text-muted-foreground">Dev Console</div>
          {/* Console logs will be rendered here */}
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ContextMenuProvider>
      <AppContent />
    </ContextMenuProvider>
  );
}

export default App;
