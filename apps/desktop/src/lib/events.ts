// Tauri event listener setup

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useDownloadStore } from "@/stores/downloads";
import { useQueueStore } from "@/stores/queues";
import { useUIStore } from "@/stores/ui";
import { CoreEvent } from "@/types";
import {
  notifyDownloadComplete,
  notifyDownloadFailed,
  notifyQueueComplete,
  notifyQueueStarted,
} from "./notifications";

// Check if we're running in Tauri context
const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

// Store for drag-drop URLs to pass to dialog
let pendingDropUrls: string[] = [];
// Store for clipboard URLs to pass to dialog
let pendingClipboardUrls: string[] = [];

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

export function setupEventListeners(): () => void {
  const unlisten: Array<() => void> = [];

  // Don't set up listeners if not in Tauri context
  if (!isTauri()) {
    console.warn("Not running in Tauri context, skipping event listeners");
    return () => {};
  }

  // Listen for download progress
  listen<CoreEvent>("download-progress", (event) => {
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
  }).then((fn) => unlisten.push(fn)).catch(console.error);

  // Listen for core errors
  listen<CoreEvent>("core-error", (event) => {
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
  })
    .then((fn) => unlisten.push(fn))
    .catch((err) => {
      useUIStore.getState().addConsoleLog({
        level: "error",
        message: `Failed to listen for core-error: ${String(err)}`,
      });
    });

  // Listen for backend logs (Rust tracing)
  listen<{
    level: "info" | "warn" | "error" | "debug";
    message: string;
    target?: string;
    module?: string | null;
    file?: string | null;
    line?: number | null;
    fields?: Record<string, unknown>;
  }>("backend-log", (event) => {
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
  })
    .then((fn) => unlisten.push(fn))
    .catch((err) => {
      useUIStore.getState().addConsoleLog({
        level: "error",
        message: `Failed to listen for backend-log: ${String(err)}`,
      });
    });

  // Listen for segment progress
  listen<CoreEvent>("segment-progress", (event) => {
    const data = event.payload;
    if (data.type === "SegmentProgress") {
      useDownloadStore.getState().updateSegmentProgress(
        data.payload.downloadId,
        data.payload.segmentIndex,
        data.payload.downloaded
      );
    }
  }).then((fn) => unlisten.push(fn)).catch(console.error);

  // Listen for status changes
  listen<CoreEvent>("download-status", (event) => {
    const data = event.payload;
    if (data.type === "DownloadStatusChanged") {
      useDownloadStore.getState().updateStatus(
        data.payload.id,
        data.payload.status,
        data.payload.error
      );
      
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
  }).then((fn) => unlisten.push(fn)).catch(console.error);

  // Listen for new downloads
  listen<CoreEvent>("download-added", (event) => {
    const data = event.payload;
    if (data.type === "DownloadAdded") {
      useDownloadStore.getState().addDownload(data.payload.download);
    }
  }).then((fn) => unlisten.push(fn)).catch(console.error);

  // Listen for updated downloads
  listen<CoreEvent>("download-updated", (event) => {
    const data = event.payload;
    if (data.type === "DownloadUpdated") {
      useDownloadStore.getState().updateDownload(data.payload.download.id, data.payload.download);
    }
  }).then((fn) => unlisten.push(fn)).catch(console.error);

  // Listen for removed downloads
  listen<CoreEvent>("download-removed", (event) => {
    const data = event.payload;
    if (data.type === "DownloadRemoved") {
      useDownloadStore.getState().removeDownload(data.payload.id);
    }
  }).then((fn) => unlisten.push(fn)).catch(console.error);

  // Listen for queue started events (scheduled starts)
  listen<CoreEvent>("queue-started", (event) => {
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
  }).then((fn) => unlisten.push(fn)).catch(console.error);

  // Listen for queue completed events
  listen<CoreEvent>("queue-completed", (event) => {
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
  }).then((fn) => unlisten.push(fn)).catch(console.error);

  // Listen for Tauri file drop events (tauri://drop)
  listen<{ paths: string[]; position: { x: number; y: number } }>(
    "tauri://drop",
    (event) => {
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
  ).then((fn) => unlisten.push(fn)).catch(console.error);

  // Cleanup function
  return () => {
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
