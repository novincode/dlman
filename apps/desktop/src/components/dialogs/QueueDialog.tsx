import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Palette, 
  Smile,
  Save,
  Trash2
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
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useUIStore } from '@/stores/ui';
import { useQueueStore } from '@/stores/queues';
import type { Queue, QueueOptions } from '@/types';

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

interface QueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editQueue?: Queue | null;
}

export function QueueDialog({ open, onOpenChange, editQueue }: QueueDialogProps) {
  const { addQueue, updateQueue, removeQueue } = useQueueStore();

  const [name, setName] = useState('');
  const [color, setColor] = useState(QUEUE_COLORS[0]);
  const [icon, setIcon] = useState<string | null>(null);
  const [maxConcurrent, setMaxConcurrent] = useState(4);
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const [segmentCount, setSegmentCount] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!editQueue;

  // Populate form when editing
  // Note: speed_limit in storage is in bytes/s, UI shows KB/s
  useEffect(() => {
    if (open && editQueue) {
      setName(editQueue.name);
      setColor(editQueue.color);
      setIcon(editQueue.icon ?? null);
      setMaxConcurrent(editQueue.max_concurrent);
      // Convert from bytes/s to KB/s for display
      setSpeedLimit(editQueue.speed_limit ? Math.round(editQueue.speed_limit / 1024) : null);
      setSegmentCount(editQueue.segment_count ?? null);
    } else if (open) {
      // Reset for new queue
      setName('');
      setColor(QUEUE_COLORS[Math.floor(Math.random() * QUEUE_COLORS.length)]);
      setIcon(null);
      setMaxConcurrent(4);
      setSpeedLimit(null);
      setSegmentCount(null);
    }
  }, [open, editQueue]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;

    try {
      setIsSaving(true);

      // Convert KB/s to bytes/s for storage
      const speedLimitBytes = speedLimit ? speedLimit * 1024 : null;

      const options: QueueOptions = {
        max_concurrent: maxConcurrent,
        speed_limit: speedLimitBytes,
        segment_count: segmentCount,
        schedule: null,
        post_action: 'none',
        color,
        icon,
      };

      if (isEditing && editQueue) {
        // Update existing queue
        try {
          await invoke('update_queue', { 
            id: editQueue.id, 
            updates: { name, ...options }
          });
        } catch (err) {
          console.error('Backend update failed, updating local state:', err);
        }
        updateQueue(editQueue.id, { name, color, icon, max_concurrent: maxConcurrent, speed_limit: speedLimitBytes, segment_count: segmentCount });
      } else {
        // Create new queue
        try {
          const queue = await invoke<Queue>('create_queue', { name, options });
          addQueue(queue);
        } catch (err) {
          console.error('Backend create failed, creating local queue:', err);
          // Create local queue as fallback
          const localQueue: Queue = {
            id: crypto.randomUUID(),
            name,
            color,
            icon,
            max_concurrent: maxConcurrent,
            speed_limit: speedLimitBytes,
            segment_count: segmentCount,
            schedule: null,
            post_action: 'none',
            created_at: new Date().toISOString(),
          };
          addQueue(localQueue);
        }
      }

      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save queue:', err);
    } finally {
      setIsSaving(false);
    }
  }, [name, color, icon, maxConcurrent, speedLimit, segmentCount, isEditing, editQueue, addQueue, updateQueue, onOpenChange]);

  const handleDelete = useCallback(async () => {
    if (!editQueue) return;

    try {
      await invoke('delete_queue', { id: editQueue.id });
    } catch (err) {
      console.error('Backend delete failed:', err);
    }
    removeQueue(editQueue.id);
    onOpenChange(false);
  }, [editQueue, removeQueue, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Queue' : 'Create New Queue'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Modify queue settings and appearance.' 
              : 'Create a new download queue to organize your downloads.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="queue-name">Name</Label>
            <Input
              id="queue-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Movies, Music, Work..."
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
                        className={`w-8 h-8 rounded-md transition-transform hover:scale-110 ${
                          color === c ? 'ring-2 ring-primary ring-offset-2' : ''
                        }`}
                        style={{ backgroundColor: c }}
                        onClick={() => setColor(c)}
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
                      className={`w-8 h-8 rounded-md border flex items-center justify-center hover:bg-accent ${
                        icon === null ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setIcon(null)}
                    >
                      ✕
                    </button>
                    {QUEUE_ICONS.map((i) => (
                      <button
                        key={i}
                        className={`w-8 h-8 rounded-md flex items-center justify-center text-lg hover:bg-accent ${
                          icon === i ? 'ring-2 ring-primary ring-offset-2' : ''
                        }`}
                        onClick={() => setIcon(i)}
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
              onValueChange={(values: number[]) => setMaxConcurrent(values[0])}
              min={1}
              max={16}
              step={1}
            />
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
                  onClick={() => setSpeedLimit(null)}
                >
                  Unlimited
                </Button>
              )}
            </div>
            <Input
              type="number"
              value={speedLimit ?? ''}
              onChange={(e) => setSpeedLimit(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Unlimited"
              min={0}
            />
          </div>

          {/* Segment Count */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Segment Count</Label>
              {segmentCount !== null && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs"
                  onClick={() => setSegmentCount(null)}
                >
                  Use App Settings
                </Button>
              )}
            </div>
            <Input
              type="number"
              value={segmentCount ?? ''}
              onChange={(e) => setSegmentCount(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Use App Settings"
              min={1}
              max={32}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {isEditing && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Queue'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Wrapper component that uses the UI store
export function QueueManagerDialog() {
  const { showQueueManagerDialog, setShowQueueManagerDialog } = useUIStore();

  return (
    <QueueDialog 
      open={showQueueManagerDialog} 
      onOpenChange={setShowQueueManagerDialog} 
    />
  );
}
