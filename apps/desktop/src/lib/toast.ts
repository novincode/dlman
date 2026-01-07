/**
 * Custom toast wrapper that respects user settings
 * Allows filtering which toasts are shown based on settings
 */

import { toast as sonnerToast, ExternalToast } from 'sonner';
import { useSettingsStore } from '@/stores/settings';

// Get current toast settings
const getToastSettings = () => {
  const settings = useSettingsStore.getState().settings;
  return {
    showSuccess: settings.toast_show_success ?? true,
    showError: settings.toast_show_error ?? true,
    showInfo: settings.toast_show_info ?? true,
  };
};

/**
 * Show a success toast (if enabled in settings)
 */
export function toastSuccess(message: string, options?: ExternalToast): void {
  const { showSuccess } = getToastSettings();
  if (showSuccess) {
    sonnerToast.success(message, options);
  }
}

/**
 * Show an error toast (if enabled in settings)
 */
export function toastError(message: string, options?: ExternalToast): void {
  const { showError } = getToastSettings();
  if (showError) {
    sonnerToast.error(message, options);
  }
}

/**
 * Show an info toast (if enabled in settings)
 */
export function toastInfo(message: string, options?: ExternalToast): void {
  const { showInfo } = getToastSettings();
  if (showInfo) {
    sonnerToast.info(message, options);
  }
}

/**
 * Show a warning toast (uses info setting)
 */
export function toastWarning(message: string, options?: ExternalToast): void {
  const { showInfo } = getToastSettings();
  if (showInfo) {
    sonnerToast.warning(message, options);
  }
}

/**
 * Toast object with the same API as sonner but respects settings
 */
export const toast = {
  success: toastSuccess,
  error: toastError,
  info: toastInfo,
  warning: toastWarning,
  // These always show (for critical messages)
  message: sonnerToast.message,
  loading: sonnerToast.loading,
  promise: sonnerToast.promise,
  dismiss: sonnerToast.dismiss,
};
