import React from "react";
import {
  Plus,
  Trash2,
  ListTodo,
  Settings,
  FolderDown,
  MoreHorizontal,
  ClipboardPaste,
  Download as DownloadIcon,
  Upload,
  Info,
  Play,
  Pause,
  CheckCircle,
  AlertCircle,
  Bug,
  RefreshCw,
  Database,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/stores/ui";
import { useDownloadStore, useFilteredDownloads } from "@/stores/downloads";
import { useQueuesArray } from "@/stores/queues";
import { useSettingsStore } from "@/stores/settings";
import { parseUrls, cn } from "@/lib/utils";
import { setPendingClipboardUrls } from "@/lib/events";
import { UpdateBadge } from "@/components/UpdateNotification";
import type { Download } from "@/types";

const isTauri = () =>
  typeof window !== "undefined" &&
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    undefined;

type MenuVariant = "default" | "destructive" | "success" | "warning" | "info";

interface MenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ElementType;
  label: string;
  variant?: MenuVariant;
}

const MenuButton = React.forwardRef<HTMLButtonElement, MenuButtonProps>(
  ({ icon: Icon, label, disabled, variant = "default", className, ...props }, ref) => {
    const colors: Record<MenuVariant, string> = {
      default: "text-foreground hover:bg-accent hover:text-accent-foreground",
      destructive: "text-destructive hover:bg-destructive/10",
      success: "text-green-600 hover:bg-green-500/10 dark:text-green-400",
      warning: "text-orange-600 hover:bg-orange-500/10 dark:text-orange-400",
      info: "text-blue-600 hover:bg-blue-500/10 dark:text-blue-400",
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-md transition-colors min-w-[68px]",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          colors[variant],
          className
        )}
        {...props}
      >
        <Icon className="h-7 w-7" strokeWidth={1.5} />
        <span className="text-[11px] font-medium leading-none">{label}</span>
      </button>
    );
  }
);
MenuButton.displayName = "MenuButton";

export function MenuBar() {
  const { t } = useTranslation();
  const {
    setShowNewDownloadDialog,
    setShowBatchImportDialog,
    setShowQueueManagerDialog,
    setShowSettingsDialog,
    setShowAboutDialog,
    setShowBulkDeleteDialog,
    openConfirmDialog,
  } = useUIStore();

  const { selectedIds, removeDownload } = useDownloadStore();
  const downloads = useFilteredDownloads();
  const queues = useQueuesArray();
  const devMode = useSettingsStore((s) => s.settings.dev_mode);

  const canStartAny = downloads.some(
    (d) => d.status === "paused" || d.status === "queued" || d.status === "pending"
  );
  const canPauseAny = downloads.some((d) => d.status === "downloading");

  const startableQueues = queues.filter((q) =>
    downloads.some(
      (d) =>
        d.queue_id === q.id &&
        (d.status === "paused" || d.status === "queued" || d.status === "pending")
    )
  );
  const pausableQueues = queues.filter((q) =>
    downloads.some((d) => d.queue_id === q.id && d.status === "downloading")
  );

  const hasCompletedDownloads = downloads.some((d) => d.status === "completed");
  const hasFailedDownloads = downloads.some((d) => d.status === "failed");
  const hasSelection = selectedIds.size > 0;

  const handleAddFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const urls = parseUrls(text);
      if (urls.length === 0) {
        toast.info(t('toasts.noUrlsInClipboard'));
        return;
      }
      setPendingClipboardUrls(urls);

      if (urls.length === 1) {
        setShowNewDownloadDialog(true);
      } else {
        setShowBatchImportDialog(true);
      }
    } catch (error) {
      console.error("Failed to read clipboard:", error);
      toast.error(t('toasts.clipboardReadFailed'));
    }
  };

  const handleExportData = async () => {
    if (!isTauri()) {
      toast.error(t('toasts.exportDesktopOnly'));
      return;
    }

    try {
      const filePath = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "dlman-export.json",
      });

      if (!filePath) return;

      const exportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        downloads: downloads.map((d: Download) => ({
          url: d.url,
          filename: d.filename,
          destination: d.destination,
          status: d.status,
          size: d.size,
          queue_id: d.queue_id,
        })),
        queues,
      };

      await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
      toast.success(t('toasts.dataExported'));
    } catch (error) {
      console.error("Failed to export data:", error);
      toast.error(t('toasts.exportFailed'));
    }
  };

  const handleImportData = async () => {
    if (!isTauri()) {
      toast.error(t('toasts.importDesktopOnly'));
      return;
    }

    try {
      const filePath = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });

      if (!filePath) return;

      const content = await readTextFile(filePath as string);
      const importData = JSON.parse(content);

      if (!importData.version || !importData.downloads) {
        toast.error(t('toasts.invalidExportFormat'));
        return;
      }

      for (const dl of importData.downloads) {
        try {
          await invoke("add_download", {
            url: dl.url,
            destination: dl.destination,
            queue_id: dl.queue_id,
          });
        } catch (err) {
          console.error("Failed to import download:", err);
        }
      }

      toast.success(t('toasts.imported', { n: importData.downloads.length }));
    } catch (error) {
      console.error("Failed to import data:", error);
      toast.error(t('toasts.importFailed'));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const startQueue = async (id: string, name: string) => {
    try {
      await invoke("start_queue", { id });
      toast.success(t('toasts.queueStarted', { name }));
    } catch (error) {
      console.error("Failed to start queue:", error);
      toast.error(t('toasts.queueStartFailed'));
    }
  };

  const pauseQueue = async (id: string, name: string) => {
    try {
      await invoke("stop_queue", { id });
      toast.success(t('toasts.queueStopped', { name }));
    } catch (error) {
      console.error("Failed to pause queue:", error);
      toast.error(t('toasts.queueStopFailed'));
    }
  };

  const handleStartAll = async () => {
    const targets = startableQueues;
    if (targets.length === 0) return;

    for (const q of targets) {
      // eslint-disable-next-line no-await-in-loop
      await startQueue(q.id, q.name);
    }
  };

  const handlePauseAll = async () => {
    const targets = pausableQueues;
    if (targets.length === 0) return;

    for (const q of targets) {
      // eslint-disable-next-line no-await-in-loop
      await pauseQueue(q.id, q.name);
    }
  };

  const handleClearCompleted = async () => {
    const completedDownloads = downloads.filter((d) => d.status === "completed");
    if (completedDownloads.length === 0) return;

    openConfirmDialog({
      title: t('menu.confirmClearCompleted.title'),
      description: t('menu.confirmClearCompleted.description', { n: completedDownloads.length }),
      confirmLabel: t('common.clear'),
      cancelLabel: t('common.cancel'),
      variant: "primary",
      onConfirm: async () => {
        for (const d of completedDownloads) {
          removeDownload(d.id);
          if (isTauri()) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await invoke("delete_download", { id: d.id, delete_file: false });
            } catch (err) {
              console.error(`Failed to delete download ${d.id}:`, err);
            }
          }
        }
        toast.success(t('toasts.clearedCompleted', { n: completedDownloads.length }));
      },
    });
  };

  const handleClearFailed = async () => {
    const failedDownloads = downloads.filter((d) => d.status === "failed");
    if (failedDownloads.length === 0) return;

    openConfirmDialog({
      title: t('menu.confirmClearFailed.title'),
      description: t('menu.confirmClearFailed.description', { n: failedDownloads.length }),
      confirmLabel: t('common.clear'),
      cancelLabel: t('common.cancel'),
      variant: "destructive",
      onConfirm: async () => {
        for (const d of failedDownloads) {
          removeDownload(d.id);
          if (isTauri()) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await invoke("delete_download", { id: d.id, delete_file: false });
            } catch (err) {
              console.error(`Failed to delete download ${d.id}:`, err);
            }
          }
        }
        toast.success(t('toasts.clearedFailed', { n: failedDownloads.length }));
      },
    });
  };

  // Dev Mode handlers
  const handleClearAllData = async () => {
    openConfirmDialog({
      title: t('menu.confirmResetData.title'),
      description: t('menu.confirmResetData.description'),
      confirmLabel: t('menu.confirmResetData.confirm'),
      variant: "destructive",
      onConfirm: async () => {
        // Clear all localStorage for this app
        const keysToRemove = ['dlman-downloads', 'dlman-categories', 'dlman-queues', 'dlman-settings', 'dlman-ui'];
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // Also clear backend if in Tauri
        if (isTauri()) {
          try {
            await invoke("clear_all_downloads");
          } catch (err) {
            console.warn("Backend clear failed:", err);
          }
        }
        
        toast.success(t('toasts.allDataCleared'));
        setTimeout(() => window.location.reload(), 1000);
      },
    });
  };

  const handleOpenDevTools = () => {
    if (isTauri()) {
      invoke("open_devtools").catch(() => {
        toast.error(t('toasts.devtoolsUnavailable'));
      });
    } else {
      toast.info(t('toasts.devtoolsBrowserHint'));
    }
  };

  const startDisabled = !canStartAny || startableQueues.length === 0;
  const pauseDisabled = !canPauseAny || pausableQueues.length === 0;

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b bg-card/50 backdrop-blur-sm">
      {/* Add */}
      <div className="flex items-center gap-1 pr-2 border-r">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton icon={Plus} label={t('common.add')} variant="success" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setShowNewDownloadDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('menu.newDownload')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleAddFromClipboard}>
              <ClipboardPaste className="h-4 w-4 mr-2" />
              {t('menu.fromClipboard')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowBatchImportDialog(true)}>
              <FolderDown className="h-4 w-4 mr-2" />
              {t('menu.importLinks')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Start/Pause */}
      <div className="flex items-center gap-1 px-2 border-r">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton
              icon={Play}
              label={t('common.start')}
              variant="info"
              disabled={startDisabled}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleStartAll} disabled={startableQueues.length === 0}>
              <Play className="h-4 w-4 mr-2" />
              {t('queues.startAll')}
            </DropdownMenuItem>
            {startableQueues.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {startableQueues.map((q) => (
                  <DropdownMenuItem key={q.id} onClick={() => startQueue(q.id, q.name)}>
                    <div
                      className="h-3 w-3 rounded-full mr-2 bg-muted"
                      style={{ backgroundColor: q.color || undefined }}
                    />
                    {t('menu.startQueueNamed', { name: q.name })}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton
              icon={Pause}
              label={t('common.pause')}
              variant="warning"
              disabled={pauseDisabled}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handlePauseAll} disabled={pausableQueues.length === 0}>
              <Pause className="h-4 w-4 mr-2" />
              {t('queues.pauseAll')}
            </DropdownMenuItem>
            {pausableQueues.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {pausableQueues.map((q) => (
                  <DropdownMenuItem key={q.id} onClick={() => pauseQueue(q.id, q.name)}>
                    <div
                      className="h-3 w-3 rounded-full mr-2 bg-muted"
                      style={{ backgroundColor: q.color || undefined }}
                    />
                    {t('menu.pauseQueueNamed', { name: q.name })}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete/Clear + Queues */}
      <div className="flex items-center gap-1 px-2 border-r">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton
              icon={Trash2}
              label={t('common.remove')}
              variant="destructive"
              disabled={!hasSelection && !hasCompletedDownloads && !hasFailedDownloads}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleDeleteSelected} disabled={!hasSelection}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('menu.removeSelected')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleClearCompleted} disabled={!hasCompletedDownloads}>
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
              {t('menu.clearCompleted')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleClearFailed} disabled={!hasFailedDownloads}>
              <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
              {t('menu.clearFailed')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <MenuButton icon={ListTodo} label={t('menu.queues')} onClick={() => setShowQueueManagerDialog(true)} />
      </div>

      <div className="flex-1" />

      {/* Tools + Dev + About + Settings */}
      <div className="flex items-center gap-1 pl-2 border-l">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton icon={MoreHorizontal} label={t('menu.tools')} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportData}>
              <DownloadIcon className="h-4 w-4 mr-2" />
              {t('menu.exportData')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleImportData}>
              <Upload className="h-4 w-4 mr-2" />
              {t('menu.importData')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dev Mode Menu - only shown when dev_mode is enabled */}
        {devMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MenuButton icon={Bug} label={t('menu.dev')} variant="warning" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleOpenDevTools}>
                <Bug className="h-4 w-4 mr-2" />
                {t('menu.openDevtools')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleClearAllData} className="text-destructive">
                <Database className="h-4 w-4 mr-2" />
                {t('menu.resetAllData')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('menu.reloadApp')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="relative">
          <MenuButton icon={Info} label={t('menu.about')} onClick={() => setShowAboutDialog(true)} />
          <UpdateBadge />
        </div>

        <MenuButton icon={Settings} label={t('settings.title')} onClick={() => setShowSettingsDialog(true)} />
      </div>
    </div>
  );
}
