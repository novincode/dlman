import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { 
  Palette, 
  Smile,
  Save,
  Trash2,
  Plus,
  Settings2,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useUIStore } from '@/stores/ui';
import { useQueueStore, useQueuesArray, DEFAULT_QUEUE_ID } from '@/stores/queues';
import { cn } from '@/lib/utils';
import type { Queue, QueueOptions } from '@/types';

// Check if we're in Tauri context
const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

// Predefined colors for queue
const QUEUE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#eab308', '#0ea5e9', '#d946ef',
];

// Predefined icons (emojis) for queue
const QUEUE_ICONS = [
  '📁', '📂', '📦', '🎵', '🎬', '📚', '🖼️', '📄', '💼', '🎮',
  '📱', '💻', '🔧', '📝', '🎨', '📷', '🎧', '📺', '🔒', '⭐',
];

export function QueueManagerDialog() {
  const { showQueueManagerDialog, setShowQueueManagerDialog } = useUIStore();
  const { addQueue, updateQueue, removeQueue } = useQueueStore();
  const queues = useQueuesArray();

  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [color, setColor] = useState(QUEUE_COLORS[0]);
  const [icon, setIcon] = useState<string | null>(null);
  const [maxConcurrent, setMaxConcurrent] = useState(4);
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);

  // Get selected queue
  const selectedQueue = selectedQueueId 
    ? queues.find(q => q.id === selectedQueueId) 
    : null;

  // Load queue data when selection changes
  useEffect(() => {
    if (selectedQueue && !isCreating) {
      setName(selectedQueue.name);
      setColor(selectedQueue.color);
      setIcon(selectedQueue.icon ?? null);
      setMaxConcurrent(selectedQueue.maxConcurrent);
      // Convert bytes/s to KB/s for display
      setSpeedLimit(selectedQueue.speedLimit ? Math.round(selectedQueue.speedLimit / 1024) : null);
      setHasChanges(false);
    }
  }, [selectedQueue, isCreating]);

  // Reset form for new queue
  const startCreating = useCallback(() => {
    setIsCreating(true);
    setSelectedQueueId(null);
    setName('');
    setColor(QUEUE_COLORS[Math.floor(Math.random() * QUEUE_COLORS.length)]);
    setIcon(null);
    setMaxConcurrent(4);
    setSpeedLimit(null);
    setHasChanges(false);
  }, []);

  const selectQueue = useCallback((id: string) => {
    setIsCreating(false);
    setSelectedQueueId(id);
  }, []);

  const handleFormChange = useCallback(() => {
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Queue name is required");
      return;
    }

    try {
      setIsSaving(true);
      
      // Convert KB/s to bytes/s for storage
      const speedLimitBytes = speedLimit ? speedLimit * 1024 : null;

      const options: QueueOptions = {
        maxConcurrent: maxConcurrent,
        speedLimit: speedLimitBytes,
        schedule: null,
        postAction: 'none',
        color,
        icon,
      };

      if (isCreating) {
        // Create new queue
        if (isTauri()) {
          try {
            const queue = await invoke<Queue>('create_queue', { name, options });
            addQueue(queue);
            setSelectedQueueId(queue.id);
          } catch (err) {
            console.error('Backend create failed:', err);
            // Create local queue as fallback
            const localQueue: Queue = {
              id: crypto.randomUUID(),
              name,
              color,
              icon,
              maxConcurrent: maxConcurrent,
              speedLimit: speedLimitBytes,
              segmentCount: null,
              schedule: null,
              postAction: 'none',
              createdAt: new Date().toISOString(),
            };
            addQueue(localQueue);
            setSelectedQueueId(localQueue.id);
          }
        } else {
          const localQueue: Queue = {
            id: crypto.randomUUID(),
            name,
            color,
            icon,
            maxConcurrent: maxConcurrent,
            speedLimit: speedLimitBytes,
            segmentCount: null,
            schedule: null,
            postAction: 'none',
            createdAt: new Date().toISOString(),
          };
          addQueue(localQueue);
          setSelectedQueueId(localQueue.id);
        }
        toast.success("Queue created");
        setIsCreating(false);
      } else if (selectedQueueId) {
        // Update existing queue
        if (isTauri()) {
          try {
            await invoke('update_queue', { 
              id: selectedQueueId, 
              updates: { name, ...options }
            });
          } catch (err) {
            console.error('Backend update failed:', err);
          }
        }
        updateQueue(selectedQueueId, { 
          name, 
          color, 
          icon, 
          maxConcurrent: maxConcurrent, 
          speedLimit: speedLimitBytes 
        });
        toast.success("Queue updated");
      }

      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save queue:', err);
      toast.error("Failed to save queue");
    } finally {
      setIsSaving(false);
    }
  }, [name, color, icon, maxConcurrent, speedLimit, isCreating, selectedQueueId, addQueue, updateQueue]);

  const handleDelete = useCallback(async () => {
    if (!selectedQueueId || selectedQueueId === DEFAULT_QUEUE_ID) return;

    if (isTauri()) {
      try {
        await invoke('delete_queue', { id: selectedQueueId });
      } catch (err) {
        console.error('Backend delete failed:', err);
      }
    }
    removeQueue(selectedQueueId);
    setSelectedQueueId(null);
    toast.success("Queue deleted");
  }, [selectedQueueId, removeQueue]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!showQueueManagerDialog) {
      setSelectedQueueId(null);
      setIsCreating(false);
      setHasChanges(false);
    } else if (queues.length > 0 && !selectedQueueId && !isCreating) {
      // Auto-select first queue when dialog opens
      setSelectedQueueId(queues[0].id);
    }
  }, [showQueueManagerDialog, queues, selectedQueueId, isCreating]);

  const isDefaultQueue = selectedQueueId === DEFAULT_QUEUE_ID;

  return (
    <Dialog open={showQueueManagerDialog} onOpenChange={setShowQueueManagerDialog}>
      <DialogContent className="sm:max-w-[700px] h-[500px] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Manage Queues
          </DialogTitle>
          <DialogDescription>
            Create, edit, and organize your download queues.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden border-t">
          {/* Queue List Sidebar */}
          <div className="w-[200px] border-r flex flex-col bg-muted/30">
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {queues.map((queue) => (
                  <button
                    key={queue.id}
                    onClick={() => selectQueue(queue.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
                      selectedQueueId === queue.id && !isCreating
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: queue.color }}
                    />
                    {queue.icon && <span>{queue.icon}</span>}
                    <span className="truncate flex-1">{queue.name}</span>
                    {queue.id === DEFAULT_QUEUE_ID && (
                      <span className="text-[10px] opacity-60">default</span>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
            <div className="p-2 border-t">
              <Button
                variant={isCreating ? "secondary" : "outline"}
                size="sm"
                className="w-full gap-2"
                onClick={startCreating}
              >
                <Plus className="h-4 w-4" />
                New Queue
              </Button>
            </div>
          </div>

          {/* Queue Editor */}
          <div className="flex-1 flex flex-col">
            {(selectedQueue || isCreating) ? (
              <>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Name */}
                    <div className="grid gap-2">
                      <Label htmlFor="queue-name">Name</Label>
                      <Input
                        id="queue-name"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          handleFormChange();
                        }}
                        placeholder="e.g., Movies, Music, Work..."
                        disabled={isDefaultQueue}
                      />
                    </div>

                    {/* Color & Icon */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Color picker */}
                      <div className="grid gap-2">
                        <Label>Color</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start">
                              <div 
                                className="w-4 h-4 rounded mr-2" 
                                style={{ backgroundColor: color }}
                              />
                              <Palette className="h-4 w-4 mr-2" />
                              Color
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-3">
                            <div className="grid grid-cols-5 gap-2">
                              {QUEUE_COLORS.map((c) => (
                                <button
                                  key={c}
                                  className={cn(
                                    "w-8 h-8 rounded-md transition-transform hover:scale-110",
                                    color === c && "ring-2 ring-primary ring-offset-2"
                                  )}
                                  style={{ backgroundColor: c }}
                                  onClick={() => {
                                    setColor(c);
                                    handleFormChange();
                                  }}
                                />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Icon picker */}
                      <div className="grid gap-2">
                        <Label>Icon</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start">
                              {icon ? (
                                <span className="text-lg mr-2">{icon}</span>
                              ) : (
                                <Smile className="h-4 w-4 mr-2" />
                              )}
                              {icon ? 'Change' : 'Add Icon'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-3">
                            <div className="grid grid-cols-5 gap-2">
                              <button
                                className={cn(
                                  "w-8 h-8 rounded-md border flex items-center justify-center hover:bg-accent",
                                  icon === null && "ring-2 ring-primary"
                                )}
                                onClick={() => {
                                  setIcon(null);
                                  handleFormChange();
                                }}
                              >
                                ✕
                              </button>
                              {QUEUE_ICONS.map((i) => (
                                <button
                                  key={i}
                                  className={cn(
                                    "w-8 h-8 rounded-md flex items-center justify-center text-lg hover:bg-accent",
                                    icon === i && "ring-2 ring-primary ring-offset-2"
                                  )}
                                  onClick={() => {
                                    setIcon(i);
                                    handleFormChange();
                                  }}
                                >
                                  {i}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Max Concurrent Downloads */}
                    <div className="grid gap-2">
                      <Label>Max Concurrent Downloads: {maxConcurrent}</Label>
                      <Slider
                        value={[maxConcurrent]}
                        onValueChange={(values: number[]) => {
                          setMaxConcurrent(values[0]);
                          handleFormChange();
                        }}
                        min={1}
                        max={16}
                        step={1}
                      />
                      <p className="text-xs text-muted-foreground">
                        Number of downloads that can run simultaneously in this queue.
                      </p>
                    </div>

                    {/* Speed Limit */}
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label>Speed Limit (KB/s)</Label>
                        {speedLimit !== null && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-xs"
                            onClick={() => {
                              setSpeedLimit(null);
                              handleFormChange();
                            }}
                          >
                            Set Unlimited
                          </Button>
                        )}
                      </div>
                      <Input
                        type="number"
                        value={speedLimit ?? ''}
                        onChange={(e) => {
                          setSpeedLimit(e.target.value ? parseInt(e.target.value) : null);
                          handleFormChange();
                        }}
                        placeholder="Unlimited"
                        min={0}
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum download speed for all downloads in this queue. Leave empty for unlimited.
                      </p>
                    </div>
                  </div>
                </ScrollArea>

                {/* Actions Footer */}
                <div className="p-4 border-t flex items-center justify-between gap-2">
                  {!isCreating && !isDefaultQueue && (
                    <Button variant="destructive" size="sm" onClick={handleDelete}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    {hasChanges && (
                      <span className="text-xs text-muted-foreground self-center mr-2">
                        Unsaved changes
                      </span>
                    )}
                    <Button 
                      onClick={handleSave} 
                      disabled={!name.trim() || isSaving || (!hasChanges && !isCreating)}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? 'Saving...' : isCreating ? 'Create Queue' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a queue to edit or create a new one
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
