import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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

interface BulkDeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloads: Download[];
  onConfirm: (deleteFiles: boolean) => void;
}

export function BulkDeleteConfirmDialog({
  open,
  onOpenChange,
  downloads,
  onConfirm,
}: BulkDeleteConfirmDialogProps) {
  const { t } = useTranslation();
  const [deleteFilesFromSystem, setDeleteFilesFromSystem] = useState(false);
  const [filesOnDisk, setFilesOnDisk] = useState<Set<string>>(new Set());
  const [isCheckingFiles, setIsCheckingFiles] = useState(false);

  // Get completed downloads (only these can have files to delete)
  const completedDownloads = downloads.filter(d => d.status === "completed");
  const hasFilesOnDisk = filesOnDisk.size > 0;
  
  // Create stable string key for dependency
  const downloadIds = downloads.map(d => d.id).join(',');

  // Check which completed files actually exist on disk
  useEffect(() => {
    if (!open) {
      setFilesOnDisk(new Set());
      return;
    }
    
    if (completedDownloads.length === 0) {
      setFilesOnDisk(new Set());
      return;
    }
    
    if (!isTauri()) return;
    
    setIsCheckingFiles(true);
    const checkFiles = async () => {
      const existingFiles = new Set<string>();
      
      // Check each completed download's file
      await Promise.all(
        completedDownloads.map(async (download) => {
          try {
            const exists = await invoke<boolean>("file_exists", {
              path: `${download.destination}/${download.filename}`,
            });
            if (exists) {
              existingFiles.add(download.id);
            }
          } catch (err) {
            console.error(`Failed to check file for ${download.filename}:`, err);
          }
        })
      );
      
      setFilesOnDisk(existingFiles);
      setIsCheckingFiles(false);
    };
    checkFiles();
  }, [open, downloadIds]);

  // Reset checkbox when dialog opens
  useEffect(() => {
    if (open) {
      setDeleteFilesFromSystem(false);
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    onConfirm(deleteFilesFromSystem);
  }, [deleteFilesFromSystem, onConfirm]);

  // Handle Enter key to confirm
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.defaultPrevented) {
        e.preventDefault();
        handleConfirm();
        onOpenChange(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleConfirm, onOpenChange]);

  const handleCancel = useCallback(() => {
    setDeleteFilesFromSystem(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const getDescription = () => {
    if (hasFilesOnDisk) {
      return t('bulkDelete.descWithFiles', { n: downloads.length, files: filesOnDisk.size });
    }
    return t('bulkDelete.descDefault', { n: downloads.length });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            {t('bulkDelete.title', { n: downloads.length })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {getDescription()}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Delete files option (only show if any completed files exist on disk) */}
        {hasFilesOnDisk && !isCheckingFiles && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 my-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="delete-files-checkbox"
                checked={deleteFilesFromSystem}
                onCheckedChange={(checked) => setDeleteFilesFromSystem(checked === true)}
                className="mt-0.5 border-destructive data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="delete-files-checkbox"
                  className="text-sm font-medium text-destructive cursor-pointer"
                >
                  {t('bulkDelete.alsoDeleteFiles', { n: filesOnDisk.size })}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('bulkDelete.deleteFilesHint')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isCheckingFiles && completedDownloads.length > 0 && (
          <div className="rounded-lg border p-4 my-2">
            <p className="text-sm text-muted-foreground">
              {t('bulkDelete.checkingFiles')}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={
              deleteFilesFromSystem
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
            disabled={isCheckingFiles}
          >
            {deleteFilesFromSystem ? t('bulkDelete.removeAndDeleteN', { n: filesOnDisk.size }) : t('common.remove')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
