import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Download,
  Folder,
  ListPlus,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { QueueDialog } from '@/components/dialogs/QueueDialog';
import { CategoryDialog } from '@/components/dialogs/CategoryDialog';

import { useUIStore } from '@/stores/ui';
import { useQueuesArray, DEFAULT_QUEUE_ID } from '@/stores/queues';
import { useDownloadStore } from '@/stores/downloads';
import { useCategoryStore } from '@/stores/categories';
import { useBatchImportPrefsStore } from '@/stores/batch-import';

import { getPendingClipboardUrls, getPendingDropUrls } from '@/lib/events';
import { parseUrls } from '@/lib/utils';
import { getCategoryDownloadPath, getDefaultBasePath } from '@/lib/download-path';
import { cn, formatBytes } from '@/lib/utils';
import type { Download as DownloadType, LinkInfo } from '@/types';

const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

type Step = 'input' | 'review';

type Item = {
  url: string;
  info: LinkInfo | null;
  loading: boolean;
  error: string | null;
  checked: boolean;
};

function uniqueKeepOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const v = u.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function looksLikeHtmlUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('/') || lower.endsWith('.html') || lower.endsWith('.htm');
}

function isHtmlItem(item: Item): boolean {
  const ct = item.info?.content_type?.toLowerCase();
  if (ct && ct.includes('text/html')) return true;
  return looksLikeHtmlUrl(item.url);
}

export function BatchImportDialog() {
  const { showBatchImportDialog, setShowBatchImportDialog } = useUIStore();
  const addDownload = useDownloadStore((s) => s.addDownload);

  const queues = useQueuesArray();
  const categoriesMap = useCategoryStore((s) => s.categories);
  const categories = useMemo(() => Array.from(categoriesMap.values()), [categoriesMap]);

  const hideHtmlPages = useBatchImportPrefsStore((s) => s.hideHtmlPages);
  const startImmediately = useBatchImportPrefsStore((s) => s.startImmediately);
  const setHideHtmlPages = useBatchImportPrefsStore((s) => s.setHideHtmlPages);
  const setStartImmediately = useBatchImportPrefsStore((s) => s.setStartImmediately);

  const [step, setStep] = useState<Step>('input');

  const [rawLinks, setRawLinks] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [destination, setDestination] = useState('');
  const [queueId, setQueueId] = useState(DEFAULT_QUEUE_ID);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const anchorIndexRef = useRef<number | null>(null);

  const pathCustomizedRef = useRef(false);
  const probeSeqRef = useRef(0);

  const [createQueueOpen, setCreateQueueOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);

  const parsedUrls = useMemo(() => uniqueKeepOrder(parseUrls(rawLinks)), [rawLinks]);

  const visibleItems = useMemo(() => {
    if (!hideHtmlPages) return items;
    return items.filter((it) => !isHtmlItem(it));
  }, [items, hideHtmlPages]);

  const checkedCount = useMemo(
    () => visibleItems.filter((it) => it.checked && !it.error).length,
    [visibleItems]
  );

  const totalBytes = useMemo(() => {
    return visibleItems
      .filter((it) => it.checked && !it.error)
      .reduce((sum, it) => sum + (it.info?.size ?? 0), 0);
  }, [visibleItems]);

  const ensureDefaultDestination = useCallback(async () => {
    try {
      const basePath = await getDefaultBasePath();
      setDestination(basePath);
    } catch {
      setDestination('');
    }
  }, []);

  const runProbe = useCallback(async (urlsToProbe: string[]) => {
    if (urlsToProbe.length === 0) return;

    const seq = (probeSeqRef.current += 1);

    for (let i = 0; i < urlsToProbe.length; i += 1) {
      if (probeSeqRef.current !== seq) return;

      const url = urlsToProbe[i];
      try {
        const res = await invoke<LinkInfo[]>('probe_links', { urls: [url] });
        const info = res?.[0] ?? null;

        if (probeSeqRef.current !== seq) return;

        setItems((prev) => {
          const idx = prev.findIndex((it) => it.url === url);
          if (idx === -1) return prev;

          const next = [...prev];
          const prevItem = next[idx];
          if (!prevItem) return prev;

          const error = info?.error ?? null;

          next[idx] = {
            ...prevItem,
            info,
            loading: false,
            error,
            checked: error ? false : prevItem.checked,
          };
          return next;
        });
      } catch (err) {
        if (probeSeqRef.current !== seq) return;

        setItems((prev) => {
          const idx = prev.findIndex((it) => it.url === url);
          if (idx === -1) return prev;

          const next = [...prev];
          const prevItem = next[idx];
          if (!prevItem) return prev;
          next[idx] = {
            ...prevItem,
            info: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to probe',
            checked: false,
          };
          return next;
        });
      }
    }
  }, []); // No dependencies - stable function

  const startNewProbe = useCallback((urls: string[], autoStepToReview: boolean) => {
    const next = urls.map<Item>((url) => ({
      url,
      info: null,
      loading: true,
      error: null,
      checked: true,
    }));

    probeSeqRef.current += 1;
    setItems(next);
    setFocusedIndex(next.length > 0 ? 0 : null);
    anchorIndexRef.current = null;

    if (autoStepToReview) {
      setStep('review');
    }

    // Start probing immediately with the URLs we have
    runProbe(urls).catch(() => {
      // errors are surfaced per-item
    });
  }, []); // Stable - runProbe is also stable

  // Open behavior: ONLY runs when dialog opens (showBatchImportDialog changes to true)
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!showBatchImportDialog) {
      // Dialog closed - reset for next open
      hasInitializedRef.current = false;
      return;
    }

    // Only initialize once per open
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const clipboardUrls = getPendingClipboardUrls();
    const dropUrls = getPendingDropUrls();
    const pending = clipboardUrls.length > 0 ? clipboardUrls : dropUrls;

    setQueueId(DEFAULT_QUEUE_ID);
    setCategoryId(null);
    pathCustomizedRef.current = false;

    ensureDefaultDestination();

    if (pending.length > 0) {
      const urls = uniqueKeepOrder(pending);
      setRawLinks(urls.join('\n'));
      startNewProbe(urls, true);
      return;
    }

    // Manual open: show input step.
    setRawLinks('');
    setItems([]);
    setStep('input');
    setFocusedIndex(null);
    anchorIndexRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBatchImportDialog]); // Only depend on showBatchImportDialog - other functions are stable

  // Hide HTML: UI-only filter. No probing.
  useEffect(() => {
    if (!hideHtmlPages) return;

    setItems((prev) =>
      prev.map((it) => {
        if (!isHtmlItem(it)) return it;
        return { ...it, checked: false };
      })
    );
  }, [hideHtmlPages]);

  const handleClose = useCallback(() => {
    probeSeqRef.current += 1;
    setShowBatchImportDialog(false);
  }, [setShowBatchImportDialog]);

  const handleBrowseDestination = useCallback(async () => {
    if (!isTauri()) {
      toast.error('Browse is only available in the desktop app');
      return;
    }

    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: destination.startsWith('~') ? undefined : destination,
      });

      if (selected && typeof selected === 'string') {
        pathCustomizedRef.current = true;
        setDestination(selected);
      }
    } catch (err) {
      console.error('Failed to open directory picker:', err);
      toast.error('Failed to open directory picker');
    }
  }, [destination]);

  const handleCategoryChange = useCallback(async (value: string) => {
    if (value === '__create__') {
      setCreateCategoryOpen(true);
      return;
    }

    const id = value === 'none' ? null : value;
    setCategoryId(id);

    if (!pathCustomizedRef.current) {
      const newPath = await getCategoryDownloadPath(id);
      setDestination(newPath);
    }
  }, []);

  const handleQueueChange = useCallback((value: string) => {
    if (value === '__create__') {
      setCreateQueueOpen(true);
      return;
    }
    setQueueId(value);
  }, []);

  const handleDestinationChange = useCallback((v: string) => {
    pathCustomizedRef.current = true;
    setDestination(v);
  }, []);

  const handleGoToReview = useCallback(() => {
    const urls = parsedUrls;
    if (urls.length === 0) {
      toast.error('No URLs found');
      return;
    }

    startNewProbe(urls, true);
  }, [parsedUrls, startNewProbe]);

  const setCheckedRange = useCallback((from: number, to: number, checked: boolean) => {
    const start = Math.min(from, to);
    const end = Math.max(from, to);

    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx < start || idx > end) return it;
        if (it.error) return it;
        if (hideHtmlPages && isHtmlItem(it)) return it;
        return { ...it, checked };
      })
    );
  }, [hideHtmlPages]);

  const toggleItem = useCallback((index: number, shiftKey: boolean) => {
    setItems((prev) => {
      const it = prev[index];
      if (!it) return prev;
      if (it.error) return prev;
      if (hideHtmlPages && isHtmlItem(it)) return prev;

      if (shiftKey && anchorIndexRef.current !== null) {
        return prev; // range handled outside in setCheckedRange
      }

      const next = [...prev];
      next[index] = { ...it, checked: !it.checked };
      return next;
    });
  }, [hideHtmlPages]);

  const handleRowClick = useCallback((index: number, shiftKey: boolean) => {
    setFocusedIndex(index);

    if (shiftKey && anchorIndexRef.current !== null) {
      setCheckedRange(anchorIndexRef.current, index, true);
      return;
    }

    anchorIndexRef.current = index;
    toggleItem(index, shiftKey);
  }, [setCheckedRange, toggleItem]);

  const handleToggleAllVisible = useCallback((checked: boolean) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.error) return it;
        if (hideHtmlPages && isHtmlItem(it)) return it;
        return { ...it, checked };
      })
    );
  }, [hideHtmlPages]);

  const handleRemove = useCallback((url: string) => {
    setItems((prev) => prev.filter((it) => it.url !== url));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd+A to select all visible items
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        e.stopPropagation();
        
        // Check if all visible items are already selected
        const visibleItems = items.filter(
          (it) => !(hideHtmlPages && isHtmlItem(it)) && !it.error
        );
        const allSelected = visibleItems.every((it) => it.checked);
        
        // Toggle: if all selected, deselect all; otherwise select all
        setItems((prev) =>
          prev.map((it) => {
            if (it.error) return it;
            if (hideHtmlPages && isHtmlItem(it)) return it;
            return { ...it, checked: !allSelected };
          })
        );
        return;
      }

      if (e.key !== ' ') return;
      e.preventDefault();

      const visibleIndexes = items
        .map((it, idx) => ({ it, idx }))
        .filter(({ it }) => !(hideHtmlPages && isHtmlItem(it)))
        .filter(({ it }) => !it.error)
        .map(({ idx }) => idx);

      if (visibleIndexes.length === 0) return;

      const checkedIndexes = visibleIndexes.filter((idx) => items[idx]?.checked);

      // If multiple are checked, space toggles the whole checked group.
      if (checkedIndexes.length > 1) {
        const allChecked = checkedIndexes.every((idx) => items[idx]?.checked);
        const nextChecked = !allChecked;
        setItems((prev) =>
          prev.map((it, idx) => {
            if (!checkedIndexes.includes(idx)) return it;
            return { ...it, checked: nextChecked };
          })
        );
        return;
      }

      // Otherwise toggle focused row (or first visible)
      const idx = focusedIndex ?? visibleIndexes[0];
      anchorIndexRef.current = idx;
      toggleItem(idx, false);
    },
    [items, hideHtmlPages, focusedIndex, toggleItem]
  );

  const handleAddSelected = useCallback(async () => {
    const selected = items.filter((it) => it.checked && !it.error).filter((it) => !(hideHtmlPages && isHtmlItem(it)));

    if (selected.length === 0) {
      toast.error('Nothing selected');
      return;
    }

    if (!destination) {
      toast.error('Please choose a destination');
      return;
    }

    try {
      setIsAdding(true);

      if (isTauri()) {
        // Use batch command to add all downloads at once
        const batchRequests = selected.map((it) => ({
          url: it.url,
          probed_info: it.info ? {
            filename: it.info.filename || undefined,
            size: it.info.size ?? undefined,
            final_url: it.info.final_url || undefined,
          } : undefined,
        }));

        const downloads = await invoke<DownloadType[]>('add_downloads_batch', {
          downloads: batchRequests,
          destination,
          queue_id: queueId,
          category_id: categoryId || undefined,
        });

        // Add all downloads to the store at once
        for (const download of downloads) {
          addDownload(download);
        }

        toast.success(`Added ${downloads.length} downloads`);
      } else {
        // Non-Tauri fallback - add one by one
        for (const it of selected) {
          const localDownload: DownloadType = {
            id: crypto.randomUUID(),
            url: it.url,
            final_url: it.info?.final_url ?? null,
            filename: it.info?.filename || it.url.split('/').pop() || 'unknown',
            destination,
            size: it.info?.size ?? null,
            downloaded: 0,
            status: 'pending',
            segments: [],
            queue_id: queueId,
            category_id: categoryId,
            color: null,
            error: null,
            speed_limit: null,
            created_at: new Date().toISOString(),
            completed_at: null,
          };
          addDownload(localDownload);
        }
        toast.success(`Added ${selected.length} downloads`);
      }

      if (startImmediately) {
        toast.message('Start immediately is enabled; queue start behavior depends on your queue settings.');
      }

      handleClose();
    } catch (err) {
      console.error('Failed to add batch downloads:', err);
      toast.error('Failed to add downloads');
    } finally {
      setIsAdding(false);
    }
  }, [items, hideHtmlPages, destination, queueId, categoryId, addDownload, startImmediately, handleClose]);

  return (
    <>
      <Dialog open={showBatchImportDialog} onOpenChange={(open) => (!open ? handleClose() : undefined)}>
        <DialogContent className="w-[80vw] max-w-none h-[80vh] max-h-[80vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="h-5 w-5" />
              Batch Import
            </DialogTitle>
            <DialogDescription>
              {step === 'input'
                ? 'Paste URLs (any text works). Then review and choose what to add.'
                : 'Review, select, and add downloads.'}
            </DialogDescription>
          </DialogHeader>

          {step === 'input' ? (
            <div className="flex-1 min-h-0 flex flex-col gap-3 py-2">
              <div className="flex-1 min-h-0">
                <Label htmlFor="batch-links">Links</Label>
                <textarea
                  id="batch-links"
                  value={rawLinks}
                  onChange={(e) => setRawLinks(e.target.value)}
                  placeholder="Paste URLs here…"
                  className="mt-2 h-full min-h-[240px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              <div className="text-sm text-muted-foreground">
                Found {parsedUrls.length} URL{parsedUrls.length === 1 ? '' : 's'}
              </div>

              <DialogFooter className="shrink-0">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleGoToReview} disabled={parsedUrls.length === 0}>
                  Review
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-4 py-2">
              <div className="shrink-0 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="batch-destination">Save to</Label>
                  <div className="flex gap-2">
                    <Input
                      id="batch-destination"
                      value={destination}
                      onChange={(e) => handleDestinationChange(e.target.value)}
                      placeholder="/path/to/downloads"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleBrowseDestination}
                      title="Browse"
                    >
                      <Folder className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={categoryId ?? 'none'} onValueChange={handleCategoryChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">No category</span>
                        </SelectItem>
                        <SelectItem value="__create__">Create new…</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                              {c.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Queue</Label>
                    <Select value={queueId} onValueChange={handleQueueChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select queue" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__create__">Create new…</SelectItem>
                        {queues.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: q.color }} />
                              {q.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => setStep('input')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Edit Links
                  </Button>

                  <Button variant="outline" size="sm" onClick={() => handleToggleAllVisible(true)}>
                    Select all
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleToggleAllVisible(false)}>
                    Select none
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Reset all items to loading and re-probe
                      probeSeqRef.current += 1;
                      const currentUrls = items.map((it) => it.url);
                      setItems((prev) => prev.map((it) => ({ ...it, info: null, error: null, loading: true, checked: true })));
                      runProbe(currentUrls).catch(() => {});
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Re-probe
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch id="hide-html" checked={hideHtmlPages} onCheckedChange={setHideHtmlPages} />
                    <Label htmlFor="hide-html" className="text-sm text-muted-foreground cursor-pointer">
                      Hide HTML
                    </Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      id="start-immediately"
                      checked={startImmediately}
                      onCheckedChange={setStartImmediately}
                    />
                    <Label
                      htmlFor="start-immediately"
                      className="text-sm text-muted-foreground cursor-pointer"
                    >
                      Start immediately
                    </Label>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {checkedCount} selected{totalBytes > 0 ? ` • ${formatBytes(totalBytes)}` : ''}
                  </div>
                </div>
              </div>

              <div
                className="flex-1 min-h-0 rounded-md border border-border"
                tabIndex={0}
                onKeyDown={handleKeyDown}
              >
                <ScrollArea className="h-full">
                  <div className="divide-y divide-border">
                    {visibleItems.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">
                        No items.
                      </div>
                    ) : (
                      visibleItems.map((it) => {
                        const absoluteIdx = items.findIndex((x) => x.url === it.url);
                        const focused = absoluteIdx === focusedIndex;
                        const disabled = !!it.error;
                        const html = isHtmlItem(it);

                        return (
                          <div
                            key={it.url}
                            className={cn(
                              'p-3 cursor-pointer select-none',
                              it.checked && !disabled ? 'bg-accent/40' : 'bg-background',
                              focused ? 'ring-2 ring-ring ring-inset' : ''
                            )}
                            onClick={(e) => {
                              handleRowClick(absoluteIdx, e.shiftKey);
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="pt-0.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRowClick(absoluteIdx, (e as any).shiftKey ?? false);
                                }}
                              >
                                <Checkbox checked={it.checked} disabled={disabled} />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  {it.loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  ) : null}

                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate">
                                      {it.info?.filename || it.url}
                                    </div>

                                    <div className="mt-1 overflow-x-auto">
                                      <div className="inline-flex max-w-full rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground whitespace-nowrap">
                                        {it.url}
                                      </div>
                                    </div>

                                    {it.error ? (
                                      <div className="mt-1 text-xs text-destructive">{it.error}</div>
                                    ) : null}

                                    {!it.loading && !it.error && html ? (
                                      <div className="mt-1 text-xs text-muted-foreground">HTML page</div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-3">
                                {!it.error && typeof it.info?.size === 'number' ? (
                                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    {formatBytes(it.info.size)}
                                  </div>
                                ) : null}

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemove(it.url);
                                  }}
                                  title="Remove"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              <DialogFooter className="shrink-0">
                <Button variant="outline" onClick={handleClose} disabled={isAdding}>
                  Cancel
                </Button>
                <Button onClick={handleAddSelected} disabled={checkedCount === 0 || isAdding}>
                  {isAdding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding…
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Add {checkedCount}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <QueueDialog open={createQueueOpen} onOpenChange={setCreateQueueOpen} />
      <CategoryDialog 
        open={createCategoryOpen} 
        onOpenChange={setCreateCategoryOpen}
        onCategoryCreated={(newCategoryId) => {
          // Auto-select the newly created category
          setCategoryId(newCategoryId);
        }}
      />
    </>
  );
}
