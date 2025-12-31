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
        // No URLs found
        return;
      }
      if (urls.length === 1) {
        setShowNewDownloadDialog(true);
      } else {
        setShowBatchImportDialog(true);
      }
    } catch (error) {
      console.error("Failed to read clipboard:", error);
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
            queueId: dl.queue_id,
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
              await invoke('delete_download', { id, deleteFile: false });
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
