/**
 * Hook for dragging files out of the app to native file managers
 * 
 * Uses Tauri's drag plugin to enable dragging completed downloads
 * to Finder, Windows Explorer, or other applications.
 */

import { useCallback, useState } from 'react';
import type { Download } from '@/types';

// Check if we're in Tauri context
const isTauri = () =>
  typeof window !== 'undefined' &&
  (window as any).__TAURI_INTERNALS__ !== undefined;

// Dynamically import the drag plugin
let startDrag: ((options: DragOptions, onEvent?: (result: DragResult) => void) => Promise<void>) | null = null;

interface DragOptions {
  item: string[];
  icon: string;
}

interface DragResult {
  result: 'Dropped' | 'Cancelled';
  cursorPos: { x: number; y: number };
}

// Initialize the drag module lazily
async function getDragModule() {
  if (!isTauri()) return null;
  
  if (!startDrag) {
    try {
      const mod = await import('@crabnebula/tauri-plugin-drag');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      startDrag = mod.startDrag as any;
    } catch (err) {
      console.error('Failed to load drag plugin:', err);
      return null;
    }
  }
  
  return startDrag;
}

export interface UseFileDragOptions {
  onDragStart?: () => void;
  onDragEnd?: (dropped: boolean) => void;
  onError?: (error: Error) => void;
}

export interface UseFileDragReturn {
  /** Whether a drag operation is in progress */
  isDragging: boolean;
  /** Whether file drag is supported (in Tauri context) */
  isSupported: boolean;
  /** Start a drag operation for the given download */
  handleDragStart: (event: React.DragEvent, download: Download) => void;
  /** Get the full file path for a download */
  getFilePath: (download: Download) => string;
}

/**
 * Hook to enable dragging completed download files out of the app
 * 
 * @example
 * ```tsx
 * function DownloadItem({ download }) {
 *   const { handleDragStart, isSupported } = useFileDrag();
 *   
 *   return (
 *     <div
 *       draggable={isSupported && download.status === 'completed'}
 *       onDragStart={(e) => handleDragStart(e, download)}
 *     >
 *       {download.filename}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFileDrag(options: UseFileDragOptions = {}): UseFileDragReturn {
  const { onDragStart, onDragEnd, onError } = options;
  const [isDragging, setIsDragging] = useState(false);
  
  const isSupported = isTauri();
  
  const getFilePath = useCallback((download: Download): string => {
    // Construct full file path
    const dest = download.destination.endsWith('/') 
      ? download.destination 
      : download.destination + '/';
    return dest + download.filename;
  }, []);
  
  const handleDragStart = useCallback(async (
    event: React.DragEvent,
    download: Download
  ) => {
    // Only allow dragging completed downloads
    if (download.status !== 'completed') {
      event.preventDefault();
      return;
    }
    
    if (!isTauri()) {
      // In browser, just set some drag data for testing
      event.dataTransfer.setData('text/plain', download.filename);
      return;
    }
    
    // CRITICAL: Prevent browser's default drag behavior
    event.preventDefault();
    
    const startDragFn = await getDragModule();
    if (!startDragFn) {
      onError?.(new Error('Drag plugin not available'));
      return;
    }
    
    const filePath = getFilePath(download);
    
    try {
      setIsDragging(true);
      onDragStart?.();
      
      await startDragFn(
        {
          item: [filePath],
          // Use the file itself as the drag icon
          icon: filePath,
        },
        (result) => {
          setIsDragging(false);
          onDragEnd?.(result.result === 'Dropped');
        }
      );
    } catch (err) {
      setIsDragging(false);
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Failed to start file drag:', error);
      onError?.(error);
    }
  }, [getFilePath, onDragStart, onDragEnd, onError]);
  
  return {
    isDragging,
    isSupported,
    handleDragStart,
    getFilePath,
  };
}

/**
 * Check if a download can be dragged (is completed and file exists)
 */
export function canDragDownload(download: Download): boolean {
  return download.status === 'completed';
}
