/**
 * Native notification system for download events
 * Uses Tauri's notification plugin for OS-level notifications
 * 
 * Note: On macOS, notifications may not work in dev mode because the app
 * isn't properly signed and registered with the notification center.
 * They should work correctly in the production build.
 */

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  Options as NotificationOptions,
} from '@tauri-apps/plugin-notification';
import { useSettingsStore } from '@/stores/settings';

// Check if we're in Tauri context
const isTauri = () =>
  typeof window !== 'undefined' &&
  (window as any).__TAURI_INTERNALS__ !== undefined;

// Get current notification settings
const getNotificationSettings = () => {
  const settings = useSettingsStore.getState().settings;
  return {
    notifyOnComplete: settings.notify_on_complete,
    notifyOnError: settings.notify_on_error,
    notifySound: settings.notify_sound,
  };
};

// Permission state
let permissionGranted = false;
let permissionChecked = false;
let initializationAttempted = false;

/**
 * Initialize the notification system
 * Requests permission if not already granted
 * 
 * Note: On macOS dev mode, permission might appear granted but
 * notifications won't show until the app is built and signed.
 */
export async function initNotifications(): Promise<boolean> {
  if (!isTauri()) {
    console.warn('Notifications: Not in Tauri context');
    return false;
  }

  if (initializationAttempted) {
    return permissionGranted;
  }
  initializationAttempted = true;

  try {
    permissionGranted = await isPermissionGranted();
    permissionChecked = true;

    if (!permissionGranted) {
      console.log('Notifications: Requesting permission...');
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    console.log('Notifications: Permission', permissionGranted ? 'granted' : 'denied');
    
    // Log a hint for dev mode
    if (import.meta.env.DEV && permissionGranted) {
      console.log('Notifications: In dev mode, notifications may not appear on macOS until the app is built.');
    }
    
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
 * Helper function to send a notification with optional sound
 */
async function sendNotificationWithOptions(
  title: string,
  body: string,
  _playSound: boolean = true
): Promise<void> {
  try {
    const options: NotificationOptions = {
      title,
      body,
      // On desktop, the OS handles sound based on system settings
      // The sound property in Tauri is primarily for Android channel sounds
      // _playSound is reserved for future platform-specific sound implementation
    };
    
    await sendNotification(options);
    console.log('Notification sent:', title);
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

/**
 * Send a download completed notification
 */
export async function notifyDownloadComplete(
  filename: string,
  _destination?: string
): Promise<void> {
  // Check if notification is enabled in settings
  const { notifyOnComplete, notifySound } = getNotificationSettings();
  if (!notifyOnComplete) return;

  if (!canSendNotifications()) {
    // Initialize on first use if not done yet
    if (!permissionChecked) {
      await initNotifications();
    }
    if (!permissionGranted) return;
  }

  await sendNotificationWithOptions('Download Complete', filename, notifySound);
}

/**
 * Send a download failed notification
 */
export async function notifyDownloadFailed(
  filename: string,
  error?: string
): Promise<void> {
  // Check if notification is enabled in settings
  const { notifyOnError, notifySound } = getNotificationSettings();
  if (!notifyOnError) return;

  if (!canSendNotifications()) {
    if (!permissionChecked) {
      await initNotifications();
    }
    if (!permissionGranted) return;
  }

  const body = error ? `${filename}: ${error}` : filename;
  await sendNotificationWithOptions('Download Failed', body, notifySound);
}

/**
 * Send a queue completed notification
 */
export async function notifyQueueComplete(queueName: string): Promise<void> {
  const { notifyOnComplete, notifySound } = getNotificationSettings();
  if (!notifyOnComplete) return;
  
  if (!canSendNotifications()) {
    if (!permissionChecked) {
      await initNotifications();
    }
    if (!permissionGranted) return;
  }

  await sendNotificationWithOptions(
    'Queue Complete',
    `All downloads in "${queueName}" have finished`,
    notifySound
  );
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

  await sendNotificationWithOptions(
    'Queue Started',
    `"${queueName}" has started downloading (scheduled)`,
    true
  );
}
