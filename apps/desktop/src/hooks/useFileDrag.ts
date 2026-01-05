/**
 * Hook for dragging files out of the app to native file managers
 * 
 * NOTE: The tauri-plugin-drag has known crash issues on macOS (foreign exception crash).
 * This feature is temporarily disabled until the plugin is more stable.
 * 
 * For now, users can:
 * - Use "Open Folder" to access files
 * - Use "Show in Finder" from context menu
 * - Copy the file path and paste in Finder
 */

import { useCallback, useState } from 'react';
import type { Download } from '@/types';

export interface UseFileDragOptions {
  onDragStart?: () => void;
  onDragEnd?: (dropped: boolean) => void;
  onError?: (error: Error) => void;
}

export interface UseFileDragReturn {
  /** Whether a drag operation is in progress */
  isDragging: boolean;
  /** Whether file drag is supported - DISABLED due to crash issues */
  isSupported: boolean;
  /** Start a drag operation for the given download */
  handleDragStart: (event: React.DragEvent, download: Download) => void;
  /** Get the full file path for a download */
  getFilePath: (download: Download) => string;
}

/**
 * Hook to enable dragging completed download files out of the app
 * 
 * TEMPORARILY DISABLED: The tauri-plugin-drag causes crashes on macOS
 * with "Rust cannot catch foreign exceptions" error.
 * 
 * TODO: Re-enable when plugin is fixed or implement native alternative
 */
export function useFileDrag(_options: UseFileDragOptions = {}): UseFileDragReturn {
  const [isDragging] = useState(false);
  
  // DISABLED: Plugin causes crashes on macOS
  const isSupported = false;
  
  const getFilePath = useCallback((download: Download): string => {
    const dest = download.destination.endsWith('/') 
      ? download.destination 
      : download.destination + '/';
    return dest + download.filename;
  }, []);
  
  const handleDragStart = useCallback((
    event: React.DragEvent,
    download: Download
  ) => {
    // DISABLED: Just set text data for potential future use
    event.dataTransfer.setData('text/plain', download.filename);
    event.dataTransfer.effectAllowed = 'copy';
  }, []);
  
  return {
    isDragging,
    isSupported,
    handleDragStart,
    getFilePath,
  };
}

/**
 * Check if a download can be dragged (is completed)
 * NOTE: Returns false since drag is disabled
 */
export function canDragDownload(_download: Download): boolean {
  return false; // Disabled until plugin crash is fixed
}
