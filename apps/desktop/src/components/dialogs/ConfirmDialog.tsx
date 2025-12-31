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

  if (!confirmDialogConfig) return null;

  const handleConfirm = async () => {
    closeConfirmDialog();
    await confirmDialogConfig.onConfirm();
  };

  const handleCancel = () => {
    closeConfirmDialog();
    confirmDialogConfig.onCancel?.();
  };

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
