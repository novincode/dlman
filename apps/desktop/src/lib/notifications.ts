/**
 * Native notification system for download events
 * Uses Tauri's notification plugin for OS-level notifications
 */

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

// Check if we're in Tauri context
const isTauri = () =>
  typeof window !== 'undefined' &&
  (window as any).__TAURI_INTERNALS__ !== undefined;

// Permission state
let permissionGranted = false;
let permissionChecked = false;

/**
 * Initialize the notification system
 * Requests permission if not already granted
 */
export async function initNotifications(): Promise<boolean> {
  if (!isTauri()) {
    console.warn('Notifications: Not in Tauri context');
    return false;
  }

  try {
    permissionGranted = await isPermissionGranted();
    permissionChecked = true;

    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    console.log('Notifications: Permission', permissionGranted ? 'granted' : 'denied');
    return permissionGranted;
  } catch (err) {
    console.error('Failed to initialize notifications:', err);
    return false;
  }
}

/**
 * Check if notifications are available and permitted
 */
export function canSendNotifications(): boolean {
  return isTauri() && permissionGranted;
}

/**
 * Send a download completed notification
 */
export async function notifyDownloadComplete(
  filename: string,
  _destination?: string
): Promise<void> {
  if (!canSendNotifications()) {
    // Initialize on first use if not done yet
    if (!permissionChecked) {
      await initNotifications();
    }
    if (!permissionGranted) return;
  }

  try {
    await sendNotification({
      title: 'Download Complete',
      body: filename,
      // Note: Actions/buttons are not fully supported in all OS
      // But the notification itself will work
    });
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

/**
 * Send a download failed notification
 */
export async function notifyDownloadFailed(
  filename: string,
  error?: string
): Promise<void> {
  if (!canSendNotifications()) {
    if (!permissionChecked) {
      await initNotifications();
    }
    if (!permissionGranted) return;
  }

  try {
    await sendNotification({
      title: 'Download Failed',
      body: error ? `${filename}: ${error}` : filename,
    });
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

/**
 * Send a queue completed notification
 */
export async function notifyQueueComplete(queueName: string): Promise<void> {
  if (!canSendNotifications()) {
    if (!permissionChecked) {
      await initNotifications();
    }
    if (!permissionGranted) return;
  }

  try {
    await sendNotification({
      title: 'Queue Complete',
      body: `All downloads in "${queueName}" have finished`,
    });
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

/**
 * Send a queue started notification (for scheduled starts)
 */
export async function notifyQueueStarted(queueName: string): Promise<void> {
  if (!canSendNotifications()) {
    if (!permissionChecked) {
      await initNotifications();
    }
    if (!permissionGranted) return;
  }

  try {
    await sendNotification({
      title: 'Queue Started',
      body: `"${queueName}" has started downloading (scheduled)`,
    });
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}
