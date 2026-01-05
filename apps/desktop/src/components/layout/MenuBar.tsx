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
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
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
  const {
    setShowNewDownloadDialog,
    setShowBatchImportDialog,
    setShowQueueManagerDialog,
    setShowSettingsDialog,
    setShowAboutDialog,
    openConfirmDialog,
  } = useUIStore();

  const { selectedIds, clearSelection, removeDownload } = useDownloadStore();
  const downloads = useFilteredDownloads();
  const queues = useQueuesArray();

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
        toast.info("No valid URLs found in clipboard");
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
      toast.error("Failed to read clipboard");
    }
  };

  const handleExportData = async () => {
    if (!isTauri()) {
      toast.error("Export is only available in the desktop app");
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
      toast.success("Data exported successfully");
    } catch (error) {
      console.error("Failed to export data:", error);
      toast.error("Failed to export data");
    }
  };

  const handleImportData = async () => {
    if (!isTauri()) {
      toast.error("Import is only available in the desktop app");
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
        toast.error("Invalid export file format");
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

      toast.success(`Imported ${importData.downloads.length} download(s)`);
    } catch (error) {
      console.error("Failed to import data:", error);
      toast.error("Failed to import data");
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;

    openConfirmDialog({
      title: "Delete Downloads",
      description: `Are you sure you want to remove ${selectedIds.size} download(s) from the list?`,
      confirmLabel: "Delete",
      variant: "destructive",
      onConfirm: async () => {
        const ids = Array.from(selectedIds);
        for (const id of ids) {
          removeDownload(id);
          if (isTauri()) {
            try {
              await invoke("delete_download", { id, delete_file: false });
            } catch (err) {
              console.error(`Failed to delete download ${id}:`, err);
            }
          }
        }
        clearSelection();
        toast.success(`Removed ${ids.length} download(s)`);
      },
    });
  };

  const startQueue = async (id: string, name: string) => {
    try {
      await invoke("start_queue", { id });
      toast.success(`Started queue: ${name}`);
    } catch (error) {
      console.error("Failed to start queue:", error);
      toast.error(`Failed to start queue: ${name}`);
    }
  };

  const pauseQueue = async (id: string, name: string) => {
    try {
      await invoke("stop_queue", { id });
      toast.success(`Paused queue: ${name}`);
    } catch (error) {
      console.error("Failed to pause queue:", error);
      toast.error(`Failed to pause queue: ${name}`);
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
      title: "Clear Completed Downloads",
      description: `This will remove ${completedDownloads.length} completed download(s) from the list. The downloaded files will not be deleted.`,
      confirmLabel: "Clear",
      cancelLabel: "Cancel",
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
        toast.success(`Cleared ${completedDownloads.length} completed download(s)`);
      },
    });
  };

  const handleClearFailed = async () => {
    const failedDownloads = downloads.filter((d) => d.status === "failed");
    if (failedDownloads.length === 0) return;

    openConfirmDialog({
      title: "Clear Failed Downloads",
      description: `This will remove ${failedDownloads.length} failed download(s) from the list.`,
      confirmLabel: "Clear",
      cancelLabel: "Cancel",
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
        toast.success(`Cleared ${failedDownloads.length} failed download(s)`);
      },
    });
  };

  const startDisabled = !canStartAny || startableQueues.length === 0;
  const pauseDisabled = !canPauseAny || pausableQueues.length === 0;

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b bg-card/50 backdrop-blur-sm">
      {/* Add */}
      <div className="flex items-center gap-1 pr-2 border-r">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton icon={Plus} label="Add" variant="success" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setShowNewDownloadDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleAddFromClipboard}>
              <ClipboardPaste className="h-4 w-4 mr-2" />
              From Clipboard
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowBatchImportDialog(true)}>
              <FolderDown className="h-4 w-4 mr-2" />
              Import Links
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
              label="Start"
              variant="info"
              disabled={startDisabled}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleStartAll} disabled={startableQueues.length === 0}>
              <Play className="h-4 w-4 mr-2" />
              Start All
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
                    Start "{q.name}"
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
              label="Pause"
              variant="warning"
              disabled={pauseDisabled}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handlePauseAll} disabled={pausableQueues.length === 0}>
              <Pause className="h-4 w-4 mr-2" />
              Pause All
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
                    Pause "{q.name}"
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
              label="Remove"
              variant="destructive"
              disabled={!hasSelection && !hasCompletedDownloads && !hasFailedDownloads}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleDeleteSelected} disabled={!hasSelection}>
              <Trash2 className="h-4 w-4 mr-2" />
              Remove Selected
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleClearCompleted} disabled={!hasCompletedDownloads}>
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
              Clear Completed
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleClearFailed} disabled={!hasFailedDownloads}>
              <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
              Clear Failed
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <MenuButton icon={ListTodo} label="Queues" onClick={() => setShowQueueManagerDialog(true)} />
      </div>

      <div className="flex-1" />

      {/* Tools + About + Settings */}
      <div className="flex items-center gap-1 pl-2 border-l">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton icon={MoreHorizontal} label="Tools" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportData}>
              <DownloadIcon className="h-4 w-4 mr-2" />
              Export Data
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleImportData}>
              <Upload className="h-4 w-4 mr-2" />
              Import Data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative">
          <MenuButton icon={Info} label="About" onClick={() => setShowAboutDialog(true)} />
          <UpdateBadge />
        </div>

        <MenuButton icon={Settings} label="Settings" onClick={() => setShowSettingsDialog(true)} />
      </div>
    </div>
  );
}
