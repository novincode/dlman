import { useEffect } from "react";
import { Toaster } from "sonner";
import { Layout } from "@/components/layout/Layout";
import {
  NewDownloadDialog,
  BatchImportDialog,
  SettingsDialog,
} from "@/components/dialogs";
import { useSettingsStore } from "@/stores/settings";
import { useDownloadStore } from "@/stores/downloads";
import { useUIStore } from "@/stores/ui";
import { setupEventListeners } from "@/lib/events";

function App() {
  const { theme, devMode } = useSettingsStore();
  const addDownload = useDownloadStore((s) => s.addDownload);
  const { setShowNewDownloadDialog, showDevConsole } = useUIStore();

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

  // Handle drag and drop
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const text = e.dataTransfer?.getData("text");
      if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
        // Open new download dialog with dropped URL
        setShowNewDownloadDialog(true);
      }

      // Handle dropped files (e.g., text files with URLs)
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        // TODO: Parse files for URLs
        console.log("Dropped files:", files);
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return (
    <>
      <Layout />
      
      {/* Dialogs */}
      <NewDownloadDialog />
      <BatchImportDialog />
      <SettingsDialog />
      
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
    </>
  );
}

export default App;
