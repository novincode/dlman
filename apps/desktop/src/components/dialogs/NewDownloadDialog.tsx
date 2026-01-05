import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Link, 
  Folder, 
  Download, 
  Loader2, 
  CheckCircle2,
  XCircle,
  Clipboard,
  Tag,
  Save,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useUIStore } from '@/stores/ui';
import { useQueuesArray, useQueueStore } from '@/stores/queues';
import { useDownloadStore } from '@/stores/downloads';
import { useCategoryStore } from '@/stores/categories';
import { getPendingClipboardUrls, getPendingDropUrls } from '@/lib/events';
import { getDefaultBasePath, getCategoryDownloadPath, detectCategoryFromFilename } from '@/lib/download-path';
import type { LinkInfo, Download as DownloadType } from '@/types';

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

export function NewDownloadDialog() {
  const { showNewDownloadDialog, setShowNewDownloadDialog } = useUIStore();
  const queues = useQueuesArray();
  const selectedQueueId = useQueueStore((s) => s.selectedQueueId);
  const categories = useMemo(
    () => useCategoryStore.getState().categories,
    []
  );
  const updateCategory = useCategoryStore((s) => s.updateCategory);
  const setSelectedCategory = useCategoryStore((s) => s.setSelectedCategory);
  const selectedCategoryId = useCategoryStore((s) => s.selectedCategoryId);
  const addDownload = useDownloadStore((s) => s.addDownload);
  const removeDownload = useDownloadStore((s) => s.removeDownload);

  // Default queue UUID (Main queue)
  const DEFAULT_QUEUE_ID = '00000000-0000-0000-0000-000000000000';
  
  const [url, setUrl] = useState('');
  const [destination, setDestination] = useState('');
  const [queueId, setQueueId] = useState(DEFAULT_QUEUE_ID);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [customFilename, setCustomFilename] = useState(''); // User-edited filename
  const [filenameEdited, setFilenameEdited] = useState(false); // Track if user edited filename
  const [showAdvancedPath, setShowAdvancedPath] = useState(false); // Show separate filename field
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [isAdding] = useState(false); // Kept for button disabled state during brief window
  const [rememberPathForCategory, setRememberPathForCategory] = useState(false);
  const [pathCustomized, setPathCustomized] = useState(false);
  // Track if user has manually customized the path (ref for logic, state for UI reactivity)
  const pathCustomizedRef = useRef(false);
  // Trigger to force re-probe when dialog opens (even with same URL)
  const [probeTrigger, setProbeTrigger] = useState(0);

  // Reset state and check for pending URLs when dialog opens
  useEffect(() => {
    if (showNewDownloadDialog) {
      // Check for pending clipboard/drop URLs
      const clipboardUrls = getPendingClipboardUrls();
      const dropUrls = getPendingDropUrls();
      const pendingUrls = clipboardUrls.length > 0 ? clipboardUrls : dropUrls;
      
      if (pendingUrls.length > 0) {
        setUrl(pendingUrls[0]);
      } else {
        setUrl('');
      }
      
      setFilename('');
      setCustomFilename('');
      setFilenameEdited(false);
      setShowAdvancedPath(false);
      setFileSize(null);
      setProbeError(null);
      setCategoryId(null);
      setRememberPathForCategory(false);
      setPathCustomized(false);
      pathCustomizedRef.current = false;
      // Force re-probe even if URL is the same as before
      setProbeTrigger(prev => prev + 1);
      
      // Set queue to selected queue if viewing a queue, otherwise use Main queue
      setQueueId(selectedQueueId ?? DEFAULT_QUEUE_ID);
      
      // Set default path
      initializeDefaultPath();
    }
  }, [showNewDownloadDialog, selectedQueueId]);

  const initializeDefaultPath = async () => {
    const basePath = await getDefaultBasePath();
    setDestination(basePath);
  };

  // Update category and path when filename changes (auto-detect)
  const updateCategoryFromFilename = useCallback(async (newFilename: string) => {
    const detectedCategory = detectCategoryFromFilename(newFilename);
    if (detectedCategory) {
      setCategoryId(detectedCategory.id);
      // Only update path if user hasn't customized it
      if (!pathCustomizedRef.current) {
        const newPath = await getCategoryDownloadPath(detectedCategory.id);
        setDestination(newPath);
      }
    }
  }, []);

  // Handle manual category change
  const handleCategoryChange = async (newCategoryId: string) => {
    const id = newCategoryId === 'none' ? null : newCategoryId;
    setCategoryId(id);
    // Only update path if user hasn't customized it
    if (!pathCustomizedRef.current) {
      const newPath = await getCategoryDownloadPath(id);
      setDestination(newPath);
    }
  };

  // Handle manual path change (marks as customized)
  const handleDestinationChange = (newPath: string) => {
    pathCustomizedRef.current = true;
    setPathCustomized(true);
    setDestination(newPath);
  };

  // Handle custom filename change
  const handleFilenameChange = (newFilename: string) => {
    setCustomFilename(newFilename);
    setFilenameEdited(true);
  };

  // Get the effective filename to use (custom if edited, otherwise probed)
  const effectiveFilename = filenameEdited && customFilename ? customFilename : filename;

  // Probe URL when it changes (debounced)
  useEffect(() => {
    if (!showNewDownloadDialog) {
      return;
    }

    if (!url) {
      setFilename('');
      setFileSize(null);
      setProbeError(null);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        if (cancelled) return;
        setIsProbing(true);
        setProbeError(null);

        const results = await invoke<LinkInfo[]>('probe_links', { urls: [url] });
        if (cancelled) return;
        const info = results[0];

        if (info?.error) {
          setProbeError(info.error);
          setFilename('');
          setFileSize(null);
        } else if (info) {
          setFilename(info.filename);
          // Only set custom filename if user hasn't edited it
          if (!filenameEdited) {
            setCustomFilename(info.filename);
          }
          setFileSize(info.size ?? null);
          setProbeError(null);
          // Auto-detect category from filename
          updateCategoryFromFilename(info.filename);
        }
      } catch (err) {
        if (cancelled) return;
        setProbeError(err instanceof Error ? err.message : 'Failed to probe URL');
      } finally {
        if (cancelled) return;
        setIsProbing(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, probeTrigger, updateCategoryFromFilename, showNewDownloadDialog]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        setUrl(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  }, []);

  const handleBrowseDestination = useCallback(async () => {
    // Check if we're in Tauri context
    if (!isTauri()) {
      toast.error('Browse is only available in the desktop app');
      return;
    }
    
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: destination.startsWith('~') 
          ? undefined // Let Tauri use default
          : destination,
      });

      if (selected) {
        pathCustomizedRef.current = true;
        setPathCustomized(true);
        setDestination(selected as string);
      }
    } catch (err) {
      console.error('Failed to open directory picker:', err);
      toast.error('Failed to open directory picker');
    }
  }, [destination]);

  const handleAddDownload = useCallback(async (startLater: boolean = false) => {
    if (!url || !destination) {
      toast.error('Please enter a URL and destination');
      return;
    }

    // Get the filename to use (custom if edited, otherwise probed)
    const filenameToUse = filenameEdited && customFilename ? customFilename : filename;
    
    // OPTIMISTIC UI: Close dialog immediately and add placeholder
    const tempId = crypto.randomUUID();
    const optimisticDownload: DownloadType = {
      id: tempId,
      url,
      final_url: null,
      filename: filenameToUse || url.split('/').pop() || 'downloading...',
      destination,
      size: fileSize,
      downloaded: 0,
      status: startLater ? 'queued' : 'pending',
      segments: [],
      queue_id: queueId,
      category_id: categoryId,
      color: null,
      error: null,
      speed_limit: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    
    // Add optimistically and close dialog immediately for snappy UX
    addDownload(optimisticDownload);
    setShowNewDownloadDialog(false);
    
    // Show immediate feedback
    if (startLater) {
      toast.success('Download added to queue');
    } else {
      toast.success('Download starting...');
    }
    
    // If user chose to remember the path for the category, update now
    if (rememberPathForCategory && categoryId) {
      updateCategory(categoryId, { customPath: destination });
    }
    
    // Auto-switch to the download's category view
    if (categoryId && selectedCategoryId !== null && selectedCategoryId !== categoryId) {
      setSelectedCategory(categoryId);
    }

    // Now perform backend add in background
    if (isTauri()) {
      try {
        const probedInfo = (filenameToUse || fileSize) ? {
          filename: filenameToUse || undefined,
          size: fileSize ?? undefined,
          final_url: undefined,
        } : undefined;

        const download = await invoke<DownloadType>('add_download', {
          url,
          destination,
          queue_id: queueId,
          category_id: categoryId || undefined,
          probed_info: probedInfo,
          start_later: startLater,
        });
        
        // Remove optimistic placeholder and add real download
        removeDownload(tempId);
        addDownload(download);
      } catch (err) {
        console.error('Backend add_download failed:', err);
        // Keep the optimistic download but show error
        toast.error('Failed to add download to backend');
      }
    }
  }, [url, destination, queueId, categoryId, filename, customFilename, filenameEdited, fileSize, addDownload, removeDownload, setShowNewDownloadDialog, rememberPathForCategory, updateCategory, categories, selectedCategoryId, setSelectedCategory]);

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  };

  return (
    <Dialog open={showNewDownloadDialog} onOpenChange={setShowNewDownloadDialog}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            New Download
          </DialogTitle>
          <DialogDescription>
            Enter the URL of the file you want to download.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-1 -mx-1">
          <div className="space-y-4 py-4 px-0.5">
          {/* URL Input */}
          <div className="space-y-2">
            <Label htmlFor="url" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              URL
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/file.zip"
                  className="pr-10"
                />
                <AnimatePresence>
                  {isProbing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute right-3 inset-y-0 flex items-center"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </motion.div>
                  )}
                  {!isProbing && filename && !probeError && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute right-3 inset-y-0 flex items-center"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </motion.div>
                  )}
                  {!isProbing && probeError && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute right-3 inset-y-0 flex items-center"
                    >
                      <XCircle className="h-4 w-4 text-destructive" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handlePasteFromClipboard}
                title="Paste from clipboard"
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </div>
            {probeError && (
              <p className="text-sm text-destructive">{probeError}</p>
            )}
          </div>

          {/* File Info - Shows detected file name and size */}
          <AnimatePresence>
            {filename && !probeError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-md border border-border bg-muted/50 p-3 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{effectiveFilename}</span>
                    {filenameEdited && (
                      <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">custom</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {fileSize && (
                      <span className="text-sm text-muted-foreground">
                        {formatFileSize(fileSize)}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdvancedPath(!showAdvancedPath)}
                      className="h-7 px-2 text-xs"
                    >
                      {showAdvancedPath ? (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Rename
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                
                {/* Expanded filename editing */}
                <AnimatePresence>
                  {showAdvancedPath && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="custom-filename" className="text-xs text-muted-foreground">
                        File name
                      </Label>
                      <Input
                        id="custom-filename"
                        value={customFilename}
                        onChange={(e) => handleFilenameChange(e.target.value)}
                        placeholder="Enter custom filename"
                        className="h-8 text-sm"
                      />
                      {filenameEdited && customFilename !== filename && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Original: {filename}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCustomFilename(filename);
                              setFilenameEdited(false);
                            }}
                            className="h-5 px-1.5 text-xs"
                          >
                            Reset
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Destination */}
          <div className="space-y-2">
            <Label htmlFor="destination" className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Save to
            </Label>
            <div className="flex gap-2">
              <Input
                id="destination"
                value={destination}
                onChange={(e) => handleDestinationChange(e.target.value)}
                placeholder="/path/to/downloads"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleBrowseDestination}
              >
                Browse
              </Button>
            </div>
            {/* Remember path for category - only show when path is customized and category is selected */}
            <AnimatePresence>
              {pathCustomized && categoryId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 pt-1"
                >
                  <Switch
                    id="remember-path"
                    checked={rememberPathForCategory}
                    onCheckedChange={setRememberPathForCategory}
                  />
                  <Label htmlFor="remember-path" className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <Save className="h-3 w-3" />
                    Remember this path for {categories.get(categoryId)?.name || 'this category'}
                  </Label>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category" className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Category
              {categoryId && (
                <span className="text-xs text-muted-foreground">(auto-detected)</span>
              )}
            </Label>
            <Select value={categoryId || 'none'} onValueChange={handleCategoryChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    No category
                  </div>
                </SelectItem>
                {Array.from(categories.values()).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Queue Selection */}
          <div className="space-y-2">
            <Label htmlFor="queue">Queue</Label>
            <Select value={queueId} onValueChange={setQueueId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a queue" />
              </SelectTrigger>
              <SelectContent>
                {queues.map((queue) => (
                  <SelectItem key={queue.id} value={queue.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: queue.color }}
                      />
                      {queue.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setShowNewDownloadDialog(false)}
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleAddDownload(true)}
            disabled={!url || !destination || isProbing || !!probeError || isAdding}
            title="Add to queue without starting"
          >
            <Clock className="mr-2 h-4 w-4" />
            Download Later
          </Button>
          <Button
            onClick={() => handleAddDownload(false)}
            disabled={!url || !destination || isProbing || !!probeError || isAdding}
          >
            {isAdding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Start Download
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
