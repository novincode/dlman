import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Link, FileText } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useUIStore } from '@/stores/ui';

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

interface DropZoneOverlayProps {
  onDrop: (urls: string[]) => void;
}

interface TauriFileDrop {
  paths: string[];
  position: { x: number; y: number };
}

export function DropZoneOverlay({ onDrop }: DropZoneOverlayProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCountRef = useRef(0);
  const isInternalDragRef = useRef(false);
  const { isDragging: isInternalDragging } = useUIStore();

  // Standard browser drag/drop handlers
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current += 1;
    
    // Check if this is an internal download drag using multiple methods
    const types = e.dataTransfer?.types || [];
    const isInternalDrag = types.includes('application/x-download-ids') || isInternalDragging;
    
    if (isInternalDrag) {
      isInternalDragRef.current = true;
      return; // Internal drag, don't show overlay
    }
    
    // Check if dragging text/url/link or files (including Firefox-specific types)
    const hasUrl = types.includes('text/plain') || 
                   types.includes('text/uri-list') || 
                   types.includes('text/html') ||
                   types.includes('text/x-moz-url'); // Firefox specific
    const hasFiles = types.includes('Files');
    
    if (hasUrl || hasFiles) {
      setIsDraggingOver(true);
    }
  }, [isInternalDragging]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current -= 1;
    if (dragCountRef.current === 0) {
      setIsDraggingOver(false);
      isInternalDragRef.current = false;
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Keep checking for internal drag
    if (isInternalDragRef.current || isInternalDragging) {
      return;
    }
  }, [isInternalDragging]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCountRef.current = 0;

    // Check if this is an internal download drag - ignore it here
    const types = e.dataTransfer?.types || [];
    if (types.includes('application/x-download-ids') || isInternalDragRef.current) {
      isInternalDragRef.current = false;
      return;
    }
    isInternalDragRef.current = false;

    const urls: string[] = [];

    // Try to get URLs from various data types
    const text = e.dataTransfer?.getData('text/plain') || '';
    const uriList = e.dataTransfer?.getData('text/uri-list') || '';
    const html = e.dataTransfer?.getData('text/html') || '';
    // Firefox uses text/x-moz-url format: URL\nTitle
    const mozUrl = e.dataTransfer?.getData('text/x-moz-url') || '';

    // Extract URLs from Firefox's text/x-moz-url (format: URL\nTitle\nURL\nTitle...)
    if (mozUrl) {
      const lines = mozUrl.split('\n');
      for (let i = 0; i < lines.length; i += 2) {
        const url = lines[i]?.trim();
        if (url && url.match(/^https?:\/\//)) {
          if (!urls.includes(url)) {
            urls.push(url);
          }
        }
      }
    }

    // Extract URLs from plain text (can be multiple lines)
    text.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.match(/^https?:\/\//)) {
        if (!urls.includes(trimmed)) {
          urls.push(trimmed);
        }
      }
    });

    // Extract URLs from uri-list
    uriList.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.match(/^https?:\/\//) && !trimmed.startsWith('#')) {
        if (!urls.includes(trimmed)) {
          urls.push(trimmed);
        }
      }
    });

    // Extract URLs from HTML (href attributes)
    const hrefMatches = html.matchAll(/href=["']?(https?:\/\/[^"'\s>]+)/gi);
    for (const match of hrefMatches) {
      const url = match[1];
      if (!urls.includes(url)) {
        urls.push(url);
      }
    }

    if (urls.length > 0) {
      onDrop(urls);
    }
  }, [onDrop]);

  // Tauri-specific file drop handling
  useEffect(() => {
    if (!isTauri()) return;

    let unlistenHover: UnlistenFn | undefined;
    let unlistenDrop: UnlistenFn | undefined;
    let unlistenCancel: UnlistenFn | undefined;

    const setupTauriListeners = async () => {
      try {
        // Handle drag hover
        unlistenHover = await listen('tauri://drag-over', () => {
          setIsDraggingOver(true);
        });

        // Handle drag leave / cancel
        unlistenCancel = await listen('tauri://drag-leave', () => {
          setIsDraggingOver(false);
        });

        // Handle file drop
        unlistenDrop = await listen<TauriFileDrop>('tauri://drop', (event) => {
          setIsDraggingOver(false);
          
          const paths = event.payload.paths || [];
          const urls: string[] = [];
          
          // Check if any paths look like URLs (from text files or .url files)
          paths.forEach((path: string) => {
            // Check if it's already a URL
            if (path.match(/^https?:\/\//)) {
              urls.push(path);
            }
            // .url files or .webloc files could be processed here
            // but for now we just ignore file drops that aren't URLs
          });
          
          if (urls.length > 0) {
            onDrop(urls);
          }
        });
      } catch (err) {
        console.error('Failed to set up Tauri drag-drop listeners:', err);
      }
    };

    setupTauriListeners();

    return () => {
      unlistenHover?.();
      unlistenDrop?.();
      unlistenCancel?.();
    };
  }, [onDrop]);

  // Browser drag/drop listeners
  useEffect(() => {
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return (
    <AnimatePresence>
      {isDraggingOver && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-4 p-12 border-4 border-dashed border-primary rounded-2xl bg-primary/5"
          >
            <div className="flex gap-4">
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}
              >
                <Link className="h-12 w-12 text-primary" />
              </motion.div>
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }}
              >
                <Download className="h-12 w-12 text-primary" />
              </motion.div>
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }}
              >
                <FileText className="h-12 w-12 text-primary" />
              </motion.div>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-semibold text-foreground">
                Drop links here
              </h3>
              <p className="text-muted-foreground mt-1">
                Drop URLs to add them as new downloads
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
