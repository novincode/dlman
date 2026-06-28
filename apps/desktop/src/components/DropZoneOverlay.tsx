import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/ui';
import { extractUrlsFromDataTransfer } from '@/lib/url-intake';

interface DropZoneOverlayProps {
  onDrop: (urls: string[]) => void;
}

export function DropZoneOverlay({ onDrop }: DropZoneOverlayProps) {
  const { t } = useTranslation();
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

  // Window-level HTML5 drag/drop. With `dragDropEnabled: false` in the Tauri
  // window config the webview receives native HTML5 DnD events (no `tauri://*`
  // file-drop interception), so this is the single source of truth for drops.
  useEffect(() => {
    const hasDraggableUrls = (e: DragEvent) => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      return (
        types.includes('Files') ||
        types.includes('text/uri-list') ||
        types.includes('text/plain') ||
        types.includes('text/html')
      );
    };

    const handleDragEnter = (e: DragEvent) => {
      if (isInternalDrag) return;
      if (!hasDraggableUrls(e)) return;
      e.preventDefault();
      dragCounter.current++;
      if (dragCounter.current === 1) {
        setIsExternalDrag(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (isInternalDrag) return;
      if (!hasDraggableUrls(e)) return;
      // Required so the subsequent `drop` event fires at all.
      e.preventDefault();
      if (dragCounter.current === 0) {
        dragCounter.current = 1;
        setIsExternalDrag(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (isInternalDrag) return;
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        resetOverlay();
      }
    };

    const handleDrop = (e: DragEvent) => {
      if (isInternalDrag) return;
      // preventDefault cancels the native drop action (e.g. inserting the URL
      // into a focused <input> when a dialog is open), so the link is handled
      // by our pipeline instead of being swallowed by the field.
      e.preventDefault();
      resetOverlay();

      const urls = extractUrlsFromDataTransfer(e.dataTransfer);

      // Diagnostic: if a drop carried data but yielded no links, log exactly what
      // the webview delivered. Cross-app drags into the WebKit/WebView can
      // withhold text/html, leaving only plain text without URLs — this makes
      // that visible in DevTools instead of a mysterious "No URLs found".
      if (urls.length === 0 && e.dataTransfer) {
        const dt = e.dataTransfer;
        console.warn('[DLMan] drop produced no URLs', {
          types: Array.from(dt.types || []),
          'text/plain': dt.getData('text/plain')?.slice(0, 400),
          'text/uri-list': dt.getData('text/uri-list')?.slice(0, 400),
          'text/html': dt.getData('text/html')?.slice(0, 800),
        });
      }

      // Always call onDrop — it gives feedback even when nothing matched, so a
      // drop never silently does nothing.
      onDrop(urls);
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
  }, [isInternalDrag, resetOverlay, onDrop]);

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
              <h3 className="text-2xl font-bold">{t('dropZone.title')}</h3>
              <p className="text-muted-foreground mt-1">
                {t('dropZone.subtitle')}
              </p>
            </div>
            <div className="flex gap-8 mt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link className="h-4 w-4" />
                <span>{t('dropZone.browserLinks')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Download className="h-4 w-4" />
                <span>{t('dropZone.directFiles')}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
