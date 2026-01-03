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
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

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

  const handleAddFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const urls = parseUrls(text);
      if (urls.length === 0) {
        toast.info("No valid URLs found in clipboard");
        return;
      }
      // Store the URLs so the dialogs can read them
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

      // Import downloads
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
          // Remove from local store
          removeDownload(id);
          
          // Delete from backend
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

  const handleStartQueue = async (queue_id: string) => {
    try {
      await invoke('start_queue', { id: queue_id });
      const queue = queues.find(q => q.id === queue_id);
      toast.success(`Started ${queue?.name || 'queue'}`);
    } catch (error) {
      console.error('Failed to start queue:', error);
      toast.error('Failed to start queue');
    }
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

  const handlePauseQueue = async (queue_id: string) => {
    try {
      await invoke('stop_queue', { id: queue_id });
      const queue = queues.find(q => q.id === queue_id);
      toast.success(`Paused ${queue?.name || 'queue'}`);
    } catch (error) {
      console.error('Failed to pause queue:', error);
      toast.error('Failed to pause queue');
    }
  };

  const handlePauseAll = async () => {
    try {
      // Stop all running queues
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
    // Get completed downloads count
    const completedDownloads = downloads.filter((d: Download) => d.status === 'completed');
    
    if (completedDownloads.length === 0) {
      toast.info('No completed downloads to clear');
      return;
    }
    
    // Show confirmation dialog
    openConfirmDialog({
      title: 'Clear Completed Downloads',
      description: `This will remove ${completedDownloads.length} completed download(s) from the list. The downloaded files will not be deleted.`,
      confirmLabel: 'Clear',
      cancelLabel: 'Cancel',
      variant: 'primary',
      onConfirm: async () => {
        try {
          for (const download of completedDownloads) {
            // Remove from local store
            removeDownload(download.id);
            
            // Delete from backend
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

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-card">
      {/* Add Download */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add
          </Button>
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

      {/* Remove */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={handleDeleteSelected}
        disabled={selectedIds.size === 0}
      >
        <Trash2 className="h-4 w-4" />
        Remove
      </Button>

      {/* Queues */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => setShowQueueManagerDialog(true)}
      >
        <ListTodo className="h-4 w-4" />
        Queues
      </Button>

      {/* Start Queue */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Play className="h-4 w-4" />
            Start
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={handleStartAllQueues}>
            <Play className="h-4 w-4 mr-2" />
            Start All Queues
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {queues.map((queue) => (
            <DropdownMenuItem
              key={queue.id}
              onClick={() => handleStartQueue(queue.id)}
            >
              <div
                className="w-2.5 h-2.5 rounded-sm shrink-0 mr-2"
                style={{ backgroundColor: queue.color }}
              />
              {queue.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Pause Queue */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Pause className="h-4 w-4" />
            Pause
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={handlePauseAll}>
            <Pause className="h-4 w-4 mr-2" />
            Pause All Queues
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {queues.map((queue) => (
            <DropdownMenuItem
              key={queue.id}
              onClick={() => handlePauseQueue(queue.id)}
            >
              <div
                className="w-2.5 h-2.5 rounded-sm shrink-0 mr-2"
                style={{ backgroundColor: queue.color }}
              />
              {queue.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear Completed */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={handleClearCompleted}
      >
        <CheckCircle className="h-4 w-4" />
        Clear Completed
      </Button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* More Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
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

      {/* Settings */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setShowSettingsDialog(true)}
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}
