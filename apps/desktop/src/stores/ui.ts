import { create } from "zustand";

interface UIState {
  // Sidebar
  sidebarWidth: number;
  sidebarCollapsed: boolean;

  // Dialogs (with both naming conventions for flexibility)
  showNewDownloadDialog: boolean;
  showBatchImportDialog: boolean;
  showQueueManagerDialog: boolean;
  showSettingsDialog: boolean;
  showDevConsole: boolean;
  confirmDialogOpen: boolean;
  confirmDialogConfig: ConfirmDialogConfig | null;

  // Drag and drop
  isDragging: boolean;
  dragOverTarget: string | null;

  // Dev console
  consoleHeight: number;
  consoleLogs: ConsoleLog[];

  // Actions
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  setShowNewDownloadDialog: (open: boolean) => void;
  setShowBatchImportDialog: (open: boolean) => void;
  setShowQueueManagerDialog: (open: boolean) => void;
  setShowSettingsDialog: (open: boolean) => void;
  setShowDevConsole: (open: boolean) => void;

  openConfirmDialog: (config: ConfirmDialogConfig) => void;
  closeConfirmDialog: () => void;

  setIsDragging: (isDragging: boolean) => void;
  setDragOverTarget: (target: string | null) => void;

  setConsoleHeight: (height: number) => void;
  addConsoleLog: (log: Omit<ConsoleLog, "id" | "timestamp">) => void;
  clearConsoleLogs: () => void;
}

interface ConfirmDialogConfig {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ConsoleLog {
  id: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: Date;
  data?: unknown;
}

export const useUIStore = create<UIState>((set, get) => ({
  // Initial state
  sidebarWidth: 260,
  sidebarCollapsed: false,
  showNewDownloadDialog: false,
  showBatchImportDialog: false,
  showQueueManagerDialog: false,
  showSettingsDialog: false,
  showDevConsole: true,
  confirmDialogOpen: false,
  confirmDialogConfig: null,
  isDragging: false,
  dragOverTarget: null,
  consoleHeight: 200,
  consoleLogs: [],

  // Actions
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setShowNewDownloadDialog: (open) => set({ showNewDownloadDialog: open }),
  setShowBatchImportDialog: (open) => set({ showBatchImportDialog: open }),
  setShowQueueManagerDialog: (open) => set({ showQueueManagerDialog: open }),
  setShowSettingsDialog: (open) => set({ showSettingsDialog: open }),
  setShowDevConsole: (open) => set({ showDevConsole: open }),

  openConfirmDialog: (config) =>
    set({ confirmDialogOpen: true, confirmDialogConfig: config }),
  closeConfirmDialog: () =>
    set({ confirmDialogOpen: false, confirmDialogConfig: null }),

  setIsDragging: (isDragging) => set({ isDragging }),
  setDragOverTarget: (dragOverTarget) => set({ dragOverTarget }),

  setConsoleHeight: (consoleHeight) => set({ consoleHeight }),
  addConsoleLog: (log) =>
    set((state) => ({
      consoleLogs: [
        ...state.consoleLogs,
        {
          ...log,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
      ].slice(-500), // Keep last 500 logs
    })),
  clearConsoleLogs: () => set({ consoleLogs: [] }),
}));
