import { useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ListPlus,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  Trash2,
  Download,
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useUIStore } from '@/stores/ui';
import { useQueuesArray } from '@/stores/queues';
import { useSettingsStore } from '@/stores/settings';
import type { LinkInfo } from '@/types';

interface ParsedLink {
  url: string;
  info: LinkInfo | null;
  isLoading: boolean;
  error: string | null;
  selected: boolean;
}

export function BatchImportDialog() {
  const { showBatchImportDialog, setShowBatchImportDialog } = useUIStore();
  const queues = useQueuesArray();
  const defaultPath = useSettingsStore((s) => s.settings.defaultDownloadPath);

  const [rawLinks, setRawLinks] = useState('');
  const [parsedLinks, setParsedLinks] = useState<ParsedLink[]>([]);
  const [destination, setDestination] = useState(defaultPath);
  const [queueId, setQueueId] = useState('00000000-0000-0000-0000-000000000000');
  const [isProbing, setIsProbing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [step, setStep] = useState<'input' | 'review'>('input');

  const parseLinks = useCallback((text: string): string[] => {
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^\[\]`]+/gi;
    const matches = text.match(urlPattern) || [];
    return [...new Set(matches)]; // Remove duplicates
  }, []);

  const handleParseAndProbe = useCallback(async () => {
    const urls = parseLinks(rawLinks);
    if (urls.length === 0) return;

    setParsedLinks(
      urls.map((url) => ({
        url,
        info: null,
        isLoading: true,
        error: null,
        selected: true,
      }))
    );
    setStep('review');
    setIsProbing(true);

    try {
      const results = await invoke<LinkInfo[]>('probe_links', { urls });

      setParsedLinks((prev) =>
        prev.map((link, index) => ({
          ...link,
          info: results[index] || null,
          isLoading: false,
          error: results[index]?.error || null,
          selected: !results[index]?.error,
        }))
      );
    } catch (err) {
      setParsedLinks((prev) =>
        prev.map((link) => ({
          ...link,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to probe',
          selected: false,
        }))
      );
    } finally {
      setIsProbing(false);
    }
  }, [rawLinks, parseLinks]);

  const handleToggleLink = useCallback((index: number) => {
    setParsedLinks((prev) =>
      prev.map((link, i) =>
        i === index ? { ...link, selected: !link.selected } : link
      )
    );
  }, []);

  const handleToggleAll = useCallback((selected: boolean) => {
    setParsedLinks((prev) =>
      prev.map((link) =>
        link.error ? link : { ...link, selected }
      )
    );
  }, []);

  const handleRemoveLink = useCallback((index: number) => {
    setParsedLinks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddSelected = useCallback(async () => {
    const selectedLinks = parsedLinks.filter((l) => l.selected && !l.error);
    if (selectedLinks.length === 0) return;

    setIsAdding(true);

    try {
      for (const link of selectedLinks) {
        await invoke('add_download', {
          url: link.url,
          destination,
          queueId,
        });
      }
      setShowBatchImportDialog(false);
      setStep('input');
      setRawLinks('');
      setParsedLinks([]);
    } catch (err) {
      console.error('Failed to add downloads:', err);
    } finally {
      setIsAdding(false);
    }
  }, [parsedLinks, destination, queueId, setShowBatchImportDialog]);

  const selectedCount = useMemo(
    () => parsedLinks.filter((l) => l.selected && !l.error).length,
    [parsedLinks]
  );

  const totalSize = useMemo(
    () =>
      parsedLinks
        .filter((l) => l.selected && !l.error && l.info?.size)
        .reduce((sum, l) => sum + (l.info?.size || 0), 0),
    [parsedLinks]
  );

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

  const handleClose = () => {
    setShowBatchImportDialog(false);
    setStep('input');
    setRawLinks('');
    setParsedLinks([]);
  };

  return (
    <Dialog open={showBatchImportDialog} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="h-5 w-5" />
            Batch Import
          </DialogTitle>
          <DialogDescription>
            {step === 'input'
              ? 'Paste multiple URLs (one per line or mixed with text).'
              : `Review ${parsedLinks.length} links before downloading.`}
          </DialogDescription>
        </DialogHeader>

        {step === 'input' ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="links">Links</Label>
              <textarea
                id="links"
                value={rawLinks}
                onChange={(e) => setRawLinks(e.target.value)}
                placeholder="Paste URLs here...&#10;https://example.com/file1.zip&#10;https://example.com/file2.zip"
                className="min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              {parseLinks(rawLinks).length} URLs detected
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden py-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleAll(true)}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleAll(false)}
                >
                  Deselect All
                </Button>
              </div>
              <span className="text-sm text-muted-foreground">
                {selectedCount} selected
                {totalSize > 0 && ` • ${formatFileSize(totalSize)}`}
              </span>
            </div>

            {/* Links List */}
            <ScrollArea className="h-[250px] rounded-md border">
              <div className="p-2 space-y-2">
                <AnimatePresence>
                  {parsedLinks.map((link, index) => (
                    <motion.div
                      key={link.url}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className={`flex items-center gap-3 rounded-md border p-2 ${
                        link.error
                          ? 'border-destructive/50 bg-destructive/10'
                          : link.selected
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border'
                      }`}
                    >
                      <Checkbox
                        checked={link.selected}
                        onCheckedChange={() => handleToggleLink(index)}
                        disabled={!!link.error || link.isLoading}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {link.isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : link.error ? (
                            <XCircle className="h-4 w-4 text-destructive" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          <span className="text-sm font-medium truncate">
                            {link.info?.filename || link.url}
                          </span>
                        </div>
                        {link.error && (
                          <p className="text-xs text-destructive mt-1">
                            {link.error}
                          </p>
                        )}
                      </div>

                      {link.info?.size && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatFileSize(link.info.size)}
                        </span>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRemoveLink(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>

            {/* Destination & Queue */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="destination">Save to</Label>
                <Input
                  id="destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="/path/to/downloads"
                />
              </div>

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
        )}

        <DialogFooter>
          {step === 'input' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleParseAndProbe}
                disabled={parseLinks(rawLinks).length === 0}
              >
                <ListPlus className="mr-2 h-4 w-4" />
                Parse & Review
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep('input')}
                disabled={isProbing || isAdding}
              >
                Back
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={selectedCount === 0 || isProbing || isAdding}
              >
                {isAdding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Add {selectedCount} Downloads
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
