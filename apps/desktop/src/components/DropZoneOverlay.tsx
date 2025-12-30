import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Link, FileText } from 'lucide-react';

interface DropZoneOverlayProps {
  onDrop: (urls: string[]) => void;
}

export function DropZoneOverlay({ onDrop }: DropZoneOverlayProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current += 1;
    
    // Check if dragging text/url/link
    const types = e.dataTransfer?.types || [];
    const hasText = types.includes('text/plain') || 
                   types.includes('text/uri-list') || 
                   types.includes('text/html');
    
    if (hasText) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current -= 1;
    if (dragCountRef.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCountRef.current = 0;

    const urls: string[] = [];

    // Try to get URLs from various data types
    const text = e.dataTransfer?.getData('text/plain') || '';
    const uriList = e.dataTransfer?.getData('text/uri-list') || '';
    const html = e.dataTransfer?.getData('text/html') || '';

    // Extract URLs from plain text (can be multiple lines)
    text.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.match(/^https?:\/\//)) {
        urls.push(trimmed);
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
