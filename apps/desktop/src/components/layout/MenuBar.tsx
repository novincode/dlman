import {
  Plus,
  Trash2,
  ListTodo,
  Settings,
  FolderDown,
  MoreHorizontal,
  ClipboardPaste,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
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
import { useDownloadStore } from "@/stores/downloads";
import { parseUrls } from "@/lib/utils";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

export function MenuBar() {
  const {
    setShowNewDownloadDialog,
    setShowBatchImportDialog,
    setShowQueueManagerDialog,
    setShowSettingsDialog,
    openConfirmDialog,
  } = useUIStore();
  const { selectedIds, clearSelection, removeDownload } = useDownloadStore();

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
          <DropdownMenuItem>Export Data</DropdownMenuItem>
          <DropdownMenuItem>Import Data</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>About DLMan</DropdownMenuItem>
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
