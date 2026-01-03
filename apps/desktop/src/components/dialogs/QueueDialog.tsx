import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Palette, 
  Smile,
  Save,
  Trash2,
  Calendar,
  Power,
  Moon,
  Bell,
  Terminal,
  Play,
  Pause,
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
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { TimePicker } from '@/components/ui/time-picker';
import { useUIStore } from '@/stores/ui';
import { useQueueStore } from '@/stores/queues';
import type { Queue, QueueOptions, Schedule, PostAction } from '@/types';

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

// Days of week
const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

// Post-completion actions
const POST_ACTIONS = [
  { value: 'none', label: 'Do nothing', icon: Play, description: 'Keep the app running' },
  { value: 'notify', label: 'Notify', icon: Bell, description: 'Show a notification' },
  { value: 'sleep', label: 'Sleep', icon: Moon, description: 'Put computer to sleep' },
  { value: 'shutdown', label: 'Shutdown', icon: Power, description: 'Shut down computer' },
  { value: 'hibernate', label: 'Hibernate', icon: Moon, description: 'Hibernate computer' },
  { value: 'run_command', label: 'Run command', icon: Terminal, description: 'Execute a custom command' },
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
  const [isSaving, setIsSaving] = useState(false);
  
  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [stopTime, setStopTime] = useState<string | null>(null);
  const [scheduleDays, setScheduleDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  
  // Post-action state
  const [postActionType, setPostActionType] = useState<string>('none');
  const [postActionCommand, setPostActionCommand] = useState('');

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
      
      // Schedule
      if (editQueue.schedule) {
        setScheduleEnabled(editQueue.schedule.enabled);
        setStartTime(editQueue.schedule.start_time);
        setStopTime(editQueue.schedule.stop_time);
        setScheduleDays(editQueue.schedule.days);
      } else {
        setScheduleEnabled(false);
        setStartTime(null);
        setStopTime(null);
        setScheduleDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
      }
      
      // Post-action
      if (typeof editQueue.post_action === 'object' && 'run_command' in editQueue.post_action) {
        setPostActionType('run_command');
        setPostActionCommand(editQueue.post_action.run_command);
      } else {
        setPostActionType(editQueue.post_action as string);
        setPostActionCommand('');
      }
    } else if (open) {
      // Reset for new queue
      setName('');
      setColor(QUEUE_COLORS[Math.floor(Math.random() * QUEUE_COLORS.length)]);
      setIcon(null);
      setMaxConcurrent(4);
      setSpeedLimit(null);
      setScheduleEnabled(false);
      setStartTime(null);
      setStopTime(null);
      setScheduleDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
      setPostActionType('none');
      setPostActionCommand('');
    }
  }, [open, editQueue]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;

    try {
      setIsSaving(true);

      // Convert KB/s to bytes/s for storage
      const speedLimitBytes = speedLimit ? speedLimit * 1024 : null;
      
      // Build schedule object
      const schedule: Schedule | null = scheduleEnabled 
        ? {
            enabled: true,
            start_time: startTime,
            stop_time: stopTime,
            days: scheduleDays,
          }
        : null;
      
      // Build post_action
      const post_action: PostAction = postActionType === 'run_command' 
        ? { run_command: postActionCommand }
        : postActionType as PostAction;

      const options: QueueOptions = {
        max_concurrent: maxConcurrent,
        speed_limit: speedLimitBytes,
        // Note: segment_count is now managed at app settings level, not per-queue
        schedule,
        post_action,
        color,
        icon,
      };

      if (isEditing && editQueue) {
        // Update existing queue
        try {
          await invoke('update_queue', { 
            id: editQueue.id, 
            options: { name, ...options }
          });
        } catch (err) {
          console.error('Backend update failed, updating local state:', err);
        }
        updateQueue(editQueue.id, { 
          name, 
          color, 
          icon, 
          max_concurrent: maxConcurrent, 
          speed_limit: speedLimitBytes,
          schedule,
          post_action,
        });
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
            schedule,
            post_action,
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
  }, [name, color, icon, maxConcurrent, speedLimit, scheduleEnabled, startTime, stopTime, scheduleDays, postActionType, postActionCommand, isEditing, editQueue, addQueue, updateQueue, onOpenChange]);

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
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
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

          <Separator />

          {/* Schedule Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Download Schedule</Label>
              </div>
              <Switch
                checked={scheduleEnabled}
                onCheckedChange={setScheduleEnabled}
              />
            </div>
            
            {scheduleEnabled && (
              <div className="space-y-3 pl-6 animate-in slide-in-from-top-2 duration-200">
                {/* Start/Stop Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Play className="h-3 w-3" />
                      Start Time
                    </Label>
                    <TimePicker
                      value={startTime}
                      onChange={setStartTime}
                      placeholder="Auto start at..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Pause className="h-3 w-3" />
                      Stop Time
                    </Label>
                    <TimePicker
                      value={stopTime}
                      onChange={setStopTime}
                      placeholder="Auto stop at..."
                    />
                  </div>
                </div>
                
                {/* Days of Week */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Active Days</Label>
                  <div className="flex gap-1">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => {
                          setScheduleDays(prev => 
                            prev.includes(day.key)
                              ? prev.filter(d => d !== day.key)
                              : [...prev, day.key]
                          );
                        }}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          scheduleDays.includes(day.key)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Post-Completion Action */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">When Queue Completes</Label>
            </div>
            
            <Select value={postActionType} onValueChange={setPostActionType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select action..." />
              </SelectTrigger>
              <SelectContent>
                {POST_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <SelectItem key={action.value} value={action.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <div>
                          <span>{action.label}</span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            
            {postActionType === 'run_command' && (
              <div className="pl-6 animate-in slide-in-from-top-2 duration-200">
                <Input
                  value={postActionCommand}
                  onChange={(e) => setPostActionCommand(e.target.value)}
                  placeholder="e.g., /usr/bin/say 'Downloads complete'"
                  className="font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Command will run in a shell when all downloads in this queue complete.
                </p>
              </div>
            )}
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
