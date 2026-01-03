import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Link } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useUIStore } from '@/stores/ui';
import { parseUrls } from '@/lib/utils';

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
  const [isExternalDrag, setIsExternalDrag] = useState(false);
  const isInternalDrag = useUIStore((s) => s.isDragging);
  const dragCounter = useRef(0);

  const resetOverlay = useCallback(() => {
    setIsExternalDrag(false);
    dragCounter.current = 0;
  }, []);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        resetOverlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [resetOverlay]);

  // Handle web drag events on the window to show the overlay
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (isInternalDrag) return;
      
      // Check if it's a file or a link
      const isFile = e.dataTransfer?.types.includes('Files');
      const isLink = e.dataTransfer?.types.includes('text/uri-list');
      const isPlain = e.dataTransfer?.types.includes('text/plain');
      
      if (isFile || isLink || isPlain) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (dragCounter.current === 1) {
          setIsExternalDrag(true);
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (isInternalDrag) return;
      e.preventDefault();
      e.stopPropagation();
      if (dragCounter.current === 0) {
        dragCounter.current = 1;
        setIsExternalDrag(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (isInternalDrag) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        resetOverlay();
      }
    };

    const handleDrop = (e: DragEvent) => {
      if (isInternalDrag) return;
      e.preventDefault();
      e.stopPropagation();
      resetOverlay();

      const urls: string[] = [];

      // 1) text/uri-list (often provided by browsers for link drags)
      const uriList = e.dataTransfer?.getData('text/uri-list');
      if (uriList) {
        const lines = uriList
          .split('\n')
          .map((l) => l.trim())
          .filter((line) => line && !line.startsWith('#'));
        urls.push(...lines.filter((u) => u.startsWith('http://') || u.startsWith('https://')));
      }

      // 2) text/plain (can contain multiple URLs when user drags selected text)
      const text = e.dataTransfer?.getData('text/plain');
      if (text) {
        urls.push(...parseUrls(text));
      }

      // 3) text/html (common when dragging selected anchors from a page)
      const html = e.dataTransfer?.getData('text/html');
      if (html) {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const hrefs = Array.from(doc.querySelectorAll('a'))
            .map((a) => a.getAttribute('href'))
            .filter((href): href is string => !!href)
            .filter((href) => href.startsWith('http://') || href.startsWith('https://'));
          urls.push(...hrefs);
        } catch {
          // ignore
        }

        // Also run regex extraction over raw HTML in case of unusual markup
        urls.push(...parseUrls(html));
      }

      // De-dupe while preserving order
      const uniqueUrls = Array.from(new Set(urls));

      if (uniqueUrls.length > 0) {
        onDrop(uniqueUrls);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [isInternalDrag, resetOverlay]);

  // Listen to Tauri drag/drop events for external files
  useEffect(() => {
    if (!isTauri()) return;

    let unlistenHover: UnlistenFn | undefined;
    let unlistenDrop: UnlistenFn | undefined;
    let unlistenCancel: UnlistenFn | undefined;

    const setupTauriListeners = async () => {
      try {
        unlistenHover = await listen('tauri://drag-over', () => {
          if (!isInternalDrag) {
            setIsExternalDrag(true);
          }
        });

        unlistenCancel = await listen('tauri://drag-leave', resetOverlay);

        unlistenDrop = await listen<TauriFileDrop>('tauri://drop', (event) => {
          if (!isInternalDrag) {
            const paths = event.payload.paths || [];
            const urls: string[] = [];
            
            paths.forEach((path: string) => {
              if (path.match(/^https?:\/\//)) {
                urls.push(path);
              }
            });
            
            if (urls.length > 0) {
              onDrop(urls);
            }
          }
          resetOverlay();
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
  }, [onDrop, resetOverlay, isInternalDrag]);

  const shouldShow = isExternalDrag && !isInternalDrag;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-xl pointer-events-auto cursor-copy"
        >
          <div className="flex flex-col items-center gap-4 text-center pointer-events-none">
            <div className="p-6 rounded-full bg-primary/10 text-primary">
              <Download className="h-12 w-12" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">Drop to Download</h3>
              <p className="text-muted-foreground mt-1">
                Drop links or files here to start downloading
              </p>
            </div>
            <div className="flex gap-8 mt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link className="h-4 w-4" />
                <span>Browser Links</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Download className="h-4 w-4" />
                <span>Direct Files</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
