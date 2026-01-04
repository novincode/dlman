import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Download } from "@/types";

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  download: Download;
  onConfirm: (deleteFile: boolean) => void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  download,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [deleteFileFromSystem, setDeleteFileFromSystem] = useState(false);
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const [isCheckingFile, setIsCheckingFile] = useState(false);

  // Determine if we should show the delete file checkbox
  // Only show for completed downloads where the file still exists
  const isCompleted = download.status === "completed";
  const showDeleteFileOption = isCompleted && fileExists === true;

  // Check if file exists when dialog opens (for completed downloads)
  useEffect(() => {
    if (open && isCompleted && isTauri()) {
      setIsCheckingFile(true);
      const checkFile = async () => {
        try {
          const exists = await invoke<boolean>("file_exists", {
            path: `${download.destination}/${download.filename}`,
          });
          setFileExists(exists);
        } catch (err) {
          console.error("Failed to check file existence:", err);
          setFileExists(false); // Assume doesn't exist on error
        } finally {
          setIsCheckingFile(false);
        }
      };
      checkFile();
    } else if (open && !isCompleted) {
      // For incomplete downloads, we don't need to check - temp segments will be deleted automatically
      setFileExists(false);
    }
  }, [open, isCompleted, download.destination, download.filename]);

  // Reset checkbox when dialog opens
  useEffect(() => {
    if (open) {
      setDeleteFileFromSystem(false);
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    onConfirm(deleteFileFromSystem);
  }, [deleteFileFromSystem, onConfirm]);

  const handleCancel = useCallback(() => {
    setDeleteFileFromSystem(false);
    onOpenChange(false);
  }, [onOpenChange]);

  // Description text based on download status
  const getDescription = () => {
    if (!isCompleted) {
      return `This download is not complete. Removing it will delete any temporary segments that have been downloaded. Are you sure you want to remove "${download.filename}"?`;
    }
    if (fileExists === false) {
      return `The downloaded file "${download.filename}" has been moved or deleted. Do you want to remove this entry from the download list?`;
    }
    return `Are you sure you want to remove "${download.filename}" from the download list?`;
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Remove Download
          </AlertDialogTitle>
          <AlertDialogDescription>
            {getDescription()}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Danger Zone - Delete file option (only for completed downloads with existing file) */}
        {showDeleteFileOption && !isCheckingFile && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 my-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="delete-file-checkbox"
                checked={deleteFileFromSystem}
                onCheckedChange={(checked) => setDeleteFileFromSystem(checked === true)}
                className="mt-0.5 border-destructive data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="delete-file-checkbox"
                  className="text-sm font-medium text-destructive cursor-pointer"
                >
                  Also delete file from system
                </Label>
                <p className="text-xs text-muted-foreground">
                  This will permanently delete the downloaded file. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info for incomplete downloads */}
        {!isCompleted && (
          <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/5 p-4 my-2">
            <p className="text-sm text-yellow-600 dark:text-yellow-500">
              <strong>Note:</strong> Temporary download segments will be automatically cleaned up.
            </p>
          </div>
        )}

        {/* Info for moved/deleted files */}
        {isCompleted && fileExists === false && !isCheckingFile && (
          <div className="rounded-lg border border-orange-500/50 bg-orange-500/5 p-4 my-2">
            <p className="text-sm text-orange-600 dark:text-orange-500">
              <strong>Note:</strong> The file has been moved or deleted from its original location.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={
              deleteFileFromSystem
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {deleteFileFromSystem ? "Remove & Delete File" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
