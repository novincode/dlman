import { useEffect, useCallback, useState } from "react";
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
import { SupportReminder } from "@/components/SupportReminder";
import { useSettingsStore, loadSettingsFromBackend } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { setupEventListeners, setPendingClipboardUrls, setPendingDropUrls } from "@/lib/events";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { parseUrls } from "@/lib/utils";
import { initSystemIntegrations } from "@/lib/system-tray";
import { initNotifications } from "@/lib/notifications";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

function AppContent() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const defaultDownloadPath = useSettingsStore((s) => s.settings.default_download_path);
  const setDefaultDownloadPath = useSettingsStore((s) => s.setDefaultDownloadPath);
  const { setShowNewDownloadDialog, setShowBatchImportDialog } = useUIStore();
  const [actualTheme, setActualTheme] = useState<"light" | "dark">("light");

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
  }, []);

  // Set up Tauri event listeners
  useEffect(() => {
    const cleanup = setupEventListeners();
    
    // Listen for deep link events from browser extension
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<string>('set-download-url', (event) => {
          // Store URL and open dialog
          setPendingClipboardUrls([event.payload]);
          setShowNewDownloadDialog(true);
        }).then((unlistenFn) => {
          unlisten = unlistenFn;
        }).catch(console.error);
      }).catch(console.error);
    }
    
    return () => {
      cleanup();
      if (unlisten) unlisten();
    };
  }, [setShowNewDownloadDialog]);

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

    // Store URLs in the drop store (separate from clipboard)
    setPendingDropUrls(urls);

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
      
      {/* Support Reminder */}
      <SupportReminder />
      
      <Toaster
        theme={actualTheme}
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
