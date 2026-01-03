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
import { parseUrls } from "@/lib/utils";
import { setPendingClipboardUrls } from "@/lib/events";
import type { Download } from "@/types";
import { cn } from "@/lib/utils";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

interface MenuButtonProps {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive" | "success" | "warning" | "info";
  className?: string;
}

function MenuButton({ icon: Icon, label, onClick, disabled, variant = "default", className }: MenuButtonProps) {
  const colors = {
    default: "text-foreground hover:bg-accent hover:text-accent-foreground",
    destructive: "text-destructive hover:bg-destructive/10",
    success: "text-green-600 hover:bg-green-500/10 dark:text-green-400",
    warning: "text-orange-600 hover:bg-orange-500/10 dark:text-orange-400",
    info: "text-blue-600 hover:bg-blue-500/10 dark:text-blue-400",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-md transition-colors min-w-[60px]",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        colors[variant],
        className
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={1.5} />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

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

  // Computed states for button disabling
  const hasActiveDownloads = downloads.some(d => d.status === 'downloading' || d.status === 'queued');
  const hasPausedDownloads = downloads.some(d => d.status === 'paused');
  const hasCompletedDownloads = downloads.some(d => d.status === 'completed');
  const hasFailedDownloads = downloads.some(d => d.status === 'failed');
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
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: 'dlman-export.json',
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
        queues: queues,
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
        filters: [{ name: 'JSON', extensions: ['json'] }],
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
          await invoke('add_download', {
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
              await invoke('delete_download', { id, delete_file: false });
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

  const handleStartAllQueues = async () => {
    try {
      for (const queue of queues) {
        await invoke('start_queue', { id: queue.id });
      }
      toast.success('All queues started');
    } catch (error) {
      console.error('Failed to start queues:', error);
      toast.error('Failed to start queues');
    }
  };

  const handlePauseAll = async () => {
    try {
      for (const queue of queues) {
        await invoke('stop_queue', { id: queue.id });
      }
      toast.success('All queues paused');
    } catch (error) {
      console.error('Failed to pause queues:', error);
      toast.error('Failed to pause queues');
    }
  };

  const handleClearCompleted = async () => {
    const completedDownloads = downloads.filter((d: Download) => d.status === 'completed');
    if (completedDownloads.length === 0) return;
    
    openConfirmDialog({
      title: 'Clear Completed Downloads',
      description: `This will remove ${completedDownloads.length} completed download(s) from the list. The downloaded files will not be deleted.`,
      confirmLabel: 'Clear',
      cancelLabel: 'Cancel',
      variant: 'primary',
      onConfirm: async () => {
        try {
          for (const download of completedDownloads) {
            removeDownload(download.id);
            if (isTauri()) {
              try {
                await invoke('delete_download', { id: download.id, delete_file: false });
              } catch (err) {
                console.error(`Failed to delete download ${download.id}:`, err);
              }
            }
          }
          toast.success(`Cleared ${completedDownloads.length} completed download(s)`);
        } catch (error) {
          console.error('Failed to clear completed downloads:', error);
          toast.error('Failed to clear completed downloads');
        }
      },
    });
  };

  const handleClearFailed = async () => {
    const failedDownloads = downloads.filter((d: Download) => d.status === 'failed');
    if (failedDownloads.length === 0) return;
    
    openConfirmDialog({
      title: 'Clear Failed Downloads',
      description: `This will remove ${failedDownloads.length} failed download(s) from the list.`,
      confirmLabel: 'Clear',
      cancelLabel: 'Cancel',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          for (const download of failedDownloads) {
            removeDownload(download.id);
            if (isTauri()) {
              try {
                await invoke('delete_download', { id: download.id, delete_file: false });
              } catch (err) {
                console.error(`Failed to delete download ${download.id}:`, err);
              }
            }
          }
          toast.success(`Cleared ${failedDownloads.length} failed download(s)`);
        } catch (error) {
          console.error('Failed to clear failed downloads:', error);
          toast.error('Failed to clear failed downloads');
        }
      },
    });
  };

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b bg-card/50 backdrop-blur-sm">
      {/* Add Group */}
      <div className="flex items-center gap-1 pr-2 border-r">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div>
              <MenuButton icon={Plus} label="Add URL" variant="success" />
            </div>
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

      {/* Control Group */}
      <div className="flex items-center gap-1 px-2 border-r">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div>
              <MenuButton 
                icon={Play} 
                label="Start" 
                disabled={!hasPausedDownloads && !hasActiveDownloads && queues.length === 0}
                variant="info"
              />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleStartAllQueues}>
              <Play className="h-4 w-4 mr-2" />
              Start All Queues
            </DropdownMenuItem>
            {queues.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {queues.map((queue) => (
                  <DropdownMenuItem 
                    key={queue.id} 
                    onClick={async () => {
                      try {
                        await invoke('start_queue', { id: queue.id });
                        toast.success(`Started queue: ${queue.name}`);
                      } catch (error) {
                        console.error('Failed to start queue:', error);
                        toast.error(`Failed to start queue: ${queue.name}`);
                      }
                    }}
                  >
                    <div 
                      className="h-3 w-3 rounded-full mr-2" 
                      style={{ backgroundColor: queue.color || '#6b7280' }} 
                    />
                    Start "{queue.name}"
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div>
              <MenuButton 
                icon={Pause} 
                label="Pause" 
                disabled={!hasActiveDownloads && queues.length === 0}
                variant="warning"
              />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handlePauseAll}>
              <Pause className="h-4 w-4 mr-2" />
              Pause All Queues
            </DropdownMenuItem>
            {queues.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {queues.map((queue) => (
                  <DropdownMenuItem 
                    key={queue.id} 
                    onClick={async () => {
                      try {
                        await invoke('stop_queue', { id: queue.id });
                        toast.success(`Paused queue: ${queue.name}`);
                      } catch (error) {
                        console.error('Failed to pause queue:', error);
                        toast.error(`Failed to pause queue: ${queue.name}`);
                      }
                    }}
                  >
                    <div 
                      className="h-3 w-3 rounded-full mr-2" 
                      style={{ backgroundColor: queue.color || '#6b7280' }} 
                    />
                    Pause "{queue.name}"
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Management Group */}
      <div className="flex items-center gap-1 px-2 border-r">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div>
              <MenuButton 
                icon={Trash2} 
                label="Delete" 
                disabled={!hasSelection && !hasCompletedDownloads && !hasFailedDownloads}
                variant="destructive"
              />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleDeleteSelected} disabled={!hasSelection}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
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

        <MenuButton 
          icon={ListTodo} 
          label="Queues" 
          onClick={() => setShowQueueManagerDialog(true)}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Tools Group */}
      <div className="flex items-center gap-1 pl-2 border-l">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div>
              <MenuButton icon={MoreHorizontal} label="Tools" />
            </div>
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
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowAboutDialog(true)}>
              <Info className="h-4 w-4 mr-2" />
              About DLMan
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <MenuButton 
          icon={Settings} 
          label="Settings" 
          onClick={() => setShowSettingsDialog(true)}
        />
      </div>
    </div>
  );
}
