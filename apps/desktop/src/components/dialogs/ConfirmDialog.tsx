import { useEffect, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUIStore } from '@/stores/ui';

export function ConfirmDialog() {
  const { confirmDialogOpen, confirmDialogConfig, closeConfirmDialog } = useUIStore();

  const handleConfirm = useCallback(async () => {
    if (!confirmDialogConfig) return;
    closeConfirmDialog();
    await confirmDialogConfig.onConfirm();
  }, [confirmDialogConfig, closeConfirmDialog]);

  const handleCancel = useCallback(() => {
    closeConfirmDialog();
    confirmDialogConfig?.onCancel?.();
  }, [confirmDialogConfig, closeConfirmDialog]);

  // Handle Enter key to confirm
  useEffect(() => {
    if (!confirmDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDialogOpen, handleConfirm]);

  if (!confirmDialogConfig) return null;

  return (
    <AlertDialog open={confirmDialogOpen} onOpenChange={(open: boolean) => !open && handleCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmDialogConfig.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmDialogConfig.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            {confirmDialogConfig.cancelLabel || 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={
              confirmDialogConfig.variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : confirmDialogConfig.variant === 'primary'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : undefined
            }
          >
            {confirmDialogConfig.confirmLabel || 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
