import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { addQueue, updateQueue, removeQueue } = useQueueStore();

  // Literal t() keys so i18next-parser can extract these config-array labels.
  const DAY_LABELS: Record<string, string> = {
    mon: t('queueDialog.days.mon'),
    tue: t('queueDialog.days.tue'),
    wed: t('queueDialog.days.wed'),
    thu: t('queueDialog.days.thu'),
    fri: t('queueDialog.days.fri'),
    sat: t('queueDialog.days.sat'),
    sun: t('queueDialog.days.sun'),
  };
  const POST_ACTION_LABELS: Record<string, string> = {
    none: t('queueDialog.postAction.none'),
    notify: t('queueDialog.postAction.notify'),
    sleep: t('queueDialog.postAction.sleep'),
    shutdown: t('queueDialog.postAction.shutdown'),
    hibernate: t('queueDialog.postAction.hibernate'),
    run_command: t('queueDialog.postAction.runCommand'),
  };

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
          <DialogTitle>{isEditing ? t('queues.editQueue') : t('queueDialog.createTitle')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('queueDialog.editDesc')
              : t('queueDialog.createDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="queue-name">{t('queueDialog.name')}</Label>
            <Input
              id="queue-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('queueDialog.namePlaceholder')}
            />
          </div>

          {/* Color & Icon */}
          <div className="grid grid-cols-2 gap-4">
            {/* Color picker */}
            <div className="grid gap-2">
              <Label>{t('queueDialog.color')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <div
                      className="w-4 h-4 rounded mr-2"
                      style={{ backgroundColor: color }}
                    />
                    <Palette className="h-4 w-4 mr-2" />
                    {t('queueDialog.color')}
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
              <Label>{t('queueDialog.icon')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    {icon ? (
                      <span className="text-lg mr-2">{icon}</span>
                    ) : (
                      <Smile className="h-4 w-4 mr-2" />
                    )}
                    {icon ? t('queueDialog.changeIcon') : t('queueDialog.addIcon')}
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
            <Label>{t('queueDialog.maxConcurrent', { n: maxConcurrent })}</Label>
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
              <Label>{t('queueDialog.speedLimitLabel')}</Label>
              {speedLimit !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setSpeedLimit(null)}
                >
                  {t('queueDialog.unlimited')}
                </Button>
              )}
            </div>
            <Input
              type="number"
              value={speedLimit ?? ''}
              onChange={(e) => setSpeedLimit(e.target.value ? parseInt(e.target.value) : null)}
              placeholder={t('queueDialog.unlimited')}
              min={0}
            />
          </div>

          <Separator />

          {/* Schedule Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">{t('queueDialog.schedule')}</Label>
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
                      {t('queueDialog.startTime')}
                    </Label>
                    <TimePicker
                      value={startTime}
                      onChange={setStartTime}
                      placeholder={t('queueDialog.startTimePlaceholder')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Pause className="h-3 w-3" />
                      {t('queueDialog.stopTime')}
                    </Label>
                    <TimePicker
                      value={stopTime}
                      onChange={setStopTime}
                      placeholder={t('queueDialog.stopTimePlaceholder')}
                    />
                  </div>
                </div>
                
                {/* Days of Week */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('queueDialog.activeDays')}</Label>
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
                        {DAY_LABELS[day.key]}
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
              <Label className="text-sm font-medium">{t('queueDialog.whenCompletes')}</Label>
            </div>

            <Select value={postActionType} onValueChange={setPostActionType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('queueDialog.selectAction')} />
              </SelectTrigger>
              <SelectContent>
                {POST_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <SelectItem key={action.value} value={action.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <div>
                          <span>{POST_ACTION_LABELS[action.value]}</span>
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
                  placeholder={t('queueDialog.commandPlaceholder')}
                  className="font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('queueDialog.commandHint')}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {isEditing && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete')}
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? t('queueDialog.saving') : isEditing ? t('queueDialog.saveChanges') : t('queueDialog.createButton')}
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
