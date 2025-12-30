// Tauri event listener setup

import { listen } from "@tauri-apps/api/event";
import { useDownloadStore } from "@/stores/downloads";
import { CoreEvent } from "@/types";

// Check if we're running in Tauri context
const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

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
        data.payload.speed,
        data.payload.eta
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

  // Listen for removed downloads
  listen<CoreEvent>("download-removed", (event) => {
    const data = event.payload;
    if (data.type === "DownloadRemoved") {
      useDownloadStore.getState().removeDownload(data.payload.id);
    }
  }).then((fn) => unlisten.push(fn)).catch(console.error);

  // Cleanup function
  return () => {
    unlisten.forEach((fn) => fn());
  };
}
