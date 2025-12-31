// Tauri event listener setup

import { listen } from "@tauri-apps/api/event";
import { useDownloadStore } from "@/stores/downloads";
import { useUIStore } from "@/stores/ui";
import { CoreEvent } from "@/types";

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
