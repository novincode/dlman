import { create } from "zustand";

// Log limits per type
interface ConsoleLogLimits {
  info: number;
  warn: number;
  error: number;
  debug: number;
}

interface UIState {
  // Sidebar
  sidebarWidth: number;
  sidebarCollapsed: boolean;

  // Dialogs (with both naming conventions for flexibility)
  showNewDownloadDialog: boolean;
  showBatchImportDialog: boolean;
  showQueueManagerDialog: boolean;
  showCategoryDialog: boolean;
  showSettingsDialog: boolean;
  showAboutDialog: boolean;
  showDevConsole: boolean;
  confirmDialogOpen: boolean;
  confirmDialogConfig: ConfirmDialogConfig | null;
  
  // Bulk delete dialog
  showBulkDeleteDialog: boolean;

  // Drag and drop
  isDragging: boolean;
  dragOverTarget: string | null;

  // Dev console
  consoleHeight: number;
  consoleLogs: ConsoleLog[];
  consoleLogLimits: ConsoleLogLimits;

  // Actions
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  setShowNewDownloadDialog: (open: boolean) => void;
  setShowBatchImportDialog: (open: boolean) => void;
  setShowQueueManagerDialog: (open: boolean) => void;
  setShowCategoryDialog: (open: boolean) => void;
  setShowSettingsDialog: (open: boolean) => void;
  setShowAboutDialog: (open: boolean) => void;
  setShowDevConsole: (open: boolean) => void;
  setShowBulkDeleteDialog: (open: boolean) => void;

  openConfirmDialog: (config: ConfirmDialogConfig) => void;
  closeConfirmDialog: () => void;

  setIsDragging: (isDragging: boolean) => void;
  setDragOverTarget: (target: string | null) => void;

  setConsoleHeight: (height: number) => void;
  setConsoleLogLimits: (limits: Partial<ConsoleLogLimits>) => void;
  addConsoleLog: (log: Omit<ConsoleLog, "id" | "timestamp">) => void;
  clearConsoleLogs: () => void;
}

interface ConfirmDialogConfig {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive" | "primary";
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

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  sidebarWidth: 260,
  sidebarCollapsed: false,
  showNewDownloadDialog: false,
  showBatchImportDialog: false,
  showQueueManagerDialog: false,
  showCategoryDialog: false,
  showSettingsDialog: false,
  showAboutDialog: false,
  showDevConsole: true,
  confirmDialogOpen: false,
  confirmDialogConfig: null,
  showBulkDeleteDialog: false,
  isDragging: false,
  dragOverTarget: null,
  consoleHeight: 200,
  consoleLogs: [],
  consoleLogLimits: { info: 200, warn: 100, error: 100, debug: 100 },

  // Actions
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setShowNewDownloadDialog: (open) => set({ showNewDownloadDialog: open }),
  setShowBatchImportDialog: (open) => set({ showBatchImportDialog: open }),
  setShowQueueManagerDialog: (open) => set({ showQueueManagerDialog: open }),
  setShowCategoryDialog: (open) => set({ showCategoryDialog: open }),
  setShowSettingsDialog: (open) => set({ showSettingsDialog: open }),
  setShowAboutDialog: (open) => set({ showAboutDialog: open }),
  setShowDevConsole: (open) => set({ showDevConsole: open }),
  setShowBulkDeleteDialog: (open) => set({ showBulkDeleteDialog: open }),

  openConfirmDialog: (config) =>
    set({ confirmDialogOpen: true, confirmDialogConfig: config }),
  closeConfirmDialog: () =>
    set({ confirmDialogOpen: false, confirmDialogConfig: null }),

  setIsDragging: (isDragging) => set({ isDragging }),
  setDragOverTarget: (dragOverTarget) => set({ dragOverTarget }),

  setConsoleHeight: (consoleHeight) => set({ consoleHeight }),
  setConsoleLogLimits: (limits) =>
    set((state) => ({
      consoleLogLimits: { ...state.consoleLogLimits, ...limits },
    })),
  addConsoleLog: (log) =>
    set((state) => {
      const newLog = {
        ...log,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      };
      const allLogs = [...state.consoleLogs, newLog];
      
      // Apply per-type limits
      const limits = state.consoleLogLimits;
      const counts: Record<string, number> = { info: 0, warn: 0, error: 0, debug: 0 };
      
      // Keep logs from the end, respecting per-type limits
      const filteredLogs: typeof allLogs = [];
      for (let i = allLogs.length - 1; i >= 0; i--) {
        const l = allLogs[i];
        const limit = limits[l.level] || 100;
        if (counts[l.level] < limit) {
          counts[l.level]++;
          filteredLogs.unshift(l);
        }
      }
      
      return { consoleLogs: filteredLogs };
    }),
  clearConsoleLogs: () => set({ consoleLogs: [] }),
}));
