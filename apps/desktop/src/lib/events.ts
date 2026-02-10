// Tauri event listener setup

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { useDownloadStore } from "@/stores/downloads";
import { useQueueStore } from "@/stores/queues";
import { useUIStore } from "@/stores/ui";
import { useCredentialsStore } from "@/stores/credentials";
import { CoreEvent } from "@/types";
import {
  notifyDownloadComplete,
  notifyDownloadFailed,
  notifyQueueComplete,
  notifyQueueStarted,
} from "./notifications";

// Check if we're running in Tauri context
const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

// Update app dock/taskbar badge with active download count
async function updateAppBadge() {
  if (!isTauri()) return;
  
  try {
    const downloads = useDownloadStore.getState().downloads;
    const activeCount = Array.from(downloads.values()).filter(
      d => d.status === 'downloading'
    ).length;
    
    const window = getCurrentWindow();
    if (activeCount > 0) {
      await window.setBadgeCount(activeCount);
    } else {
      await window.setBadgeCount(undefined);
    }
  } catch (e) {
    // Badge API might not be available on all platforms
    console.debug('Badge update failed:', e);
  }
}

// Store for drag-drop URLs to pass to dialog
let pendingDropUrls: string[] = [];
// Store for clipboard URLs to pass to dialog
let pendingClipboardUrls: string[] = [];
// Store for cookies passed from browser extension
let pendingCookies: string | undefined = undefined;

export function getPendingDropUrls(): string[] {
  const urls = [...pendingDropUrls];
  pendingDropUrls = [];
  return urls;
}

export function setPendingDropUrls(urls: string[]) {
  pendingDropUrls = urls;
}

export function getPendingClipboardUrls(): string[] {
  const urls = [...pendingClipboardUrls];
  pendingClipboardUrls = [];
  return urls;
}

export function setPendingClipboardUrls(urls: string[]) {
  pendingClipboardUrls = urls;
}

export function getPendingCookies(): string | undefined {
  const cookies = pendingCookies;
  pendingCookies = undefined;
  return cookies;
}

export function setPendingCookies(cookies: string | undefined) {
  pendingCookies = cookies;
}

export function setupEventListeners(): () => void {
  // Track cleanup state - if true, any newly resolved listeners should immediately unsubscribe
  let isCleanedUp = false;
  const unlisten: Array<() => void> = [];

  // Helper to register a listener that respects cleanup state
  const registerListener = (promise: Promise<() => void>) => {
    promise.then((fn) => {
      if (isCleanedUp) {
        // Already cleaned up - immediately unsubscribe
        fn();
      } else {
        unlisten.push(fn);
      }
    }).catch(console.error);
  };

  // Don't set up listeners if not in Tauri context
  if (!isTauri()) {
    console.warn("Not running in Tauri context, skipping event listeners");
    return () => {};
  }

  // Listen for download progress
  registerListener(listen<CoreEvent>("download-progress", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "DownloadProgress") {
      useDownloadStore.getState().updateProgress(
        data.payload.id,
        data.payload.downloaded,
        data.payload.total ?? null,
        data.payload.speed,
        data.payload.eta
      );
    }
  }));

  // Listen for core errors
  registerListener(listen<CoreEvent>("core-error", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "Error") {
      useUIStore.getState().addConsoleLog({
        level: "error",
        message: data.payload.context
          ? `${data.payload.message} (${data.payload.context})`
          : data.payload.message,
        data: data.payload.context ? { context: data.payload.context } : undefined,
      });
    }
  }));

  // Listen for backend logs (Rust tracing)
  registerListener(listen<{
    level: "info" | "warn" | "error" | "debug";
    message: string;
    target?: string;
    module?: string | null;
    file?: string | null;
    line?: number | null;
    fields?: Record<string, unknown>;
  }>("backend-log", (event) => {
    if (isCleanedUp) return;
    const p = event.payload;
    useUIStore.getState().addConsoleLog({
      level: p.level,
      message: p.target ? `[${p.target}] ${p.message}` : p.message,
      data: {
        module: p.module,
        file: p.file,
        line: p.line,
        fields: p.fields,
      },
    });
  }));

  // Listen for segment progress
  registerListener(listen<CoreEvent>("segment-progress", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "SegmentProgress") {
      useDownloadStore.getState().updateSegmentProgress(
        data.payload.downloadId,
        data.payload.segmentIndex,
        data.payload.downloaded
      );
    }
  }));

  // Listen for status changes
  registerListener(listen<CoreEvent>("download-status", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "DownloadStatusChanged") {
      useDownloadStore.getState().updateStatus(
        data.payload.id,
        data.payload.status,
        data.payload.error
      );
      
      // Update app badge when download status changes
      updateAppBadge();
      
      // Show toast notification for completed/failed downloads
      if (data.payload.status === "completed") {
        const download = useDownloadStore.getState().downloads.get(data.payload.id);
        const filename = download?.filename || 'Unknown file';
        toast.success(`Download completed: ${filename}`);
        // Also send OS notification if app not focused
        if (document.hidden && download) {
          notifyDownloadComplete(filename, download.destination);
        }
        
        // Check if all downloads in this queue are complete
        if (download) {
          checkQueueCompletion(download.queue_id);
        }
      } else if (data.payload.status === "failed" && data.payload.error) {
        const download = useDownloadStore.getState().downloads.get(data.payload.id);
        const filename = download?.filename || 'Unknown file';
        toast.error(`Download failed: ${filename}`, {
          description: data.payload.error,
        });
        // Also send OS notification if app not focused
        if (document.hidden) {
          notifyDownloadFailed(filename, data.payload.error);
        }
      }
    }
  }));

  // Listen for new downloads
  registerListener(listen<CoreEvent>("download-added", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "DownloadAdded") {
      useDownloadStore.getState().addDownload(data.payload.download);
    }
  }));

  // Listen for updated downloads
  registerListener(listen<CoreEvent>("download-updated", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "DownloadUpdated") {
      useDownloadStore.getState().updateDownload(data.payload.download.id, data.payload.download);
    }
  }));

  // Listen for removed downloads
  registerListener(listen<CoreEvent>("download-removed", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "DownloadRemoved") {
      useDownloadStore.getState().removeDownload(data.payload.id);
    }
  }));

  // Listen for queue started events (scheduled starts)
  registerListener(listen<CoreEvent>("queue-started", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "QueueStarted") {
      const queues = useQueueStore.getState().queues;
      const queue = queues.get(data.payload.id);
      if (queue) {
        toast.info(`Queue "${queue.name}" started`);
        // Send OS notification
        notifyQueueStarted(queue.name);
      }
    }
  }));

  // Listen for queue completed events
  registerListener(listen<CoreEvent>("queue-completed", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "QueueCompleted") {
      const queues = useQueueStore.getState().queues;
      const queue = queues.get(data.payload.id);
      if (queue) {
        toast.success(`Queue "${queue.name}" stopped`);
        // Send OS notification if app not focused
        if (document.hidden) {
          notifyQueueComplete(queue.name);
        }
      }
    }
  }));

  // Listen for credential required events (401/403 from server)
  registerListener(listen<CoreEvent>("credential-required", (event) => {
    if (isCleanedUp) return;
    const data = event.payload;
    if (data.type === "CredentialRequired") {
      toast.info(`Authentication required for ${data.payload.domain}`, {
        description: "Please provide credentials to continue downloading.",
      });
      // Set the pending request to open the credential prompt dialog
      useCredentialsStore.getState().setPendingRequest(data.payload);
    }
  }));

  // Listen for Tauri file drop events (tauri://drop)
  registerListener(listen<{ paths: string[]; position: { x: number; y: number } }>(
    "tauri://drop",
    (event) => {
      if (isCleanedUp) return;
      const { paths } = event.payload;
      
      // Filter for URLs (files starting with http)
      // Note: Tauri drops files as paths, but we can also handle dropped text/URLs
      // For now, just check if any path looks like a URL
      const urls = paths.filter(p => p.startsWith('http://') || p.startsWith('https://'));
      
      if (urls.length > 0) {
        setPendingDropUrls(urls);
        if (urls.length === 1) {
          useUIStore.getState().setShowNewDownloadDialog(true);
        } else {
          useUIStore.getState().setShowBatchImportDialog(true);
        }
      }
    }
  ));

  // Listen for show-new-download-dialog event (from deep links / extension)
  // Payload can be a plain URL string (legacy) or structured object with url, referrer, filename, cookies
  registerListener(listen<string | { url: string; referrer?: string; filename?: string; cookies?: string } | null>(
    "show-new-download-dialog",
    (event) => {
      if (isCleanedUp) return;
      const payload = event.payload;
      
      // Parse payload - can be string (URL) or structured object
      if (payload) {
        if (typeof payload === 'string') {
          // Legacy: plain URL string
          setPendingClipboardUrls([payload]);
          setPendingCookies(undefined);
        } else if (typeof payload === 'object' && payload.url) {
          // Structured payload from browser extension
          setPendingClipboardUrls([payload.url]);
          setPendingCookies(payload.cookies);
        }
      }
      
      // Show the new download dialog
      useUIStore.getState().setShowNewDownloadDialog(true);
    }
  ));

  // Listen for show-batch-download-dialog event (from extension bulk download)
  registerListener(listen<string[]>(
    "show-batch-download-dialog",
    (event) => {
      if (isCleanedUp) return;
      const urls = event.payload;
      
      if (urls && urls.length > 0) {
        setPendingDropUrls(urls);
        useUIStore.getState().setShowBatchImportDialog(true);
      }
    }
  ));

  // Cleanup function - marks as cleaned up and unsubscribes all already-resolved listeners
  return () => {
    isCleanedUp = true;
    unlisten.forEach((fn) => fn());
  };
}

/**
 * Check if all downloads in a queue are complete and execute post-action if so
 */
async function checkQueueCompletion(queueId: string) {
  const downloadStore = useDownloadStore.getState();
  const queueStore = useQueueStore.getState();
  const downloads = Array.from(downloadStore.downloads.values());
  const queueDownloads = downloads.filter((d) => d.queue_id === queueId);
  
  // Check if there are any non-completed, non-failed downloads
  const pendingDownloads = queueDownloads.filter(
    (d) => d.status !== 'completed' && d.status !== 'failed'
  );
  
  if (pendingDownloads.length > 0 || queueDownloads.length === 0) {
    return; // Still have pending downloads or no downloads in queue
  }
  
  // All downloads complete/failed - check for post-action
  const queue = queueStore.queues.get(queueId);
  if (!queue) return;
  
  const postAction = queue.post_action;
  if (!postAction || postAction === 'none') return;
  
  // Notify about queue completion
  notifyQueueComplete(queue.name);
  
  // Execute the post-action
  try {
    if (typeof postAction === 'object' && 'run_command' in postAction) {
      await invoke('execute_post_action', { 
        action: 'run_command', 
        command: postAction.run_command 
      });
      toast.info(`Executed command for queue "${queue.name}"`);
    } else if (postAction !== 'notify') {
      // Sleep, shutdown, hibernate
      toast.info(`Executing ${postAction}...`, { duration: 5000 });
      await invoke('execute_post_action', { action: postAction });
    }
  } catch (err) {
    console.error('Failed to execute post-action:', err);
    toast.error(`Failed to execute ${postAction}: ${err}`);
  }
}
