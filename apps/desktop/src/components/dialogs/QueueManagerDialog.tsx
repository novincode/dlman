import { useState, useEffect, useCallback } from 'react';
import { Plus, Settings2, Clock } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { QueueDialog } from './QueueDialog';
import { useUIStore } from '@/stores/ui';
import { useQueuesArray, DEFAULT_QUEUE_ID } from '@/stores/queues';
import { cn } from '@/lib/utils';
import type { Queue } from '@/types';

export function QueueManagerDialog() {
  const { showQueueManagerDialog, setShowQueueManagerDialog } = useUIStore();
  const queues = useQueuesArray();

  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [showQueueDialog, setShowQueueDialog] = useState(false);
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null);

  // Select a queue from the list
  const selectQueue = useCallback((id: string) => {
    setSelectedQueueId(id);
    const queue = queues.find(q => q.id === id);
    if (queue) {
      setEditingQueue(queue);
      setShowQueueDialog(true);
    }
  }, [queues]);

  // Start creating a new queue
  const startCreating = useCallback(() => {
    setEditingQueue(null);
    setShowQueueDialog(true);
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!showQueueManagerDialog) {
      setSelectedQueueId(null);
      setShowQueueDialog(false);
      setEditingQueue(null);
    } else if (queues.length > 0 && !selectedQueueId) {
      // Auto-select first queue when dialog opens
      setSelectedQueueId(queues[0].id);
    }
  }, [showQueueManagerDialog, queues, selectedQueueId]);

  return (
    <>
      <Dialog open={showQueueManagerDialog} onOpenChange={setShowQueueManagerDialog}>
        <DialogContent className="sm:max-w-[320px] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Manage Queues
            </DialogTitle>
            <DialogDescription>
              Select a queue to edit or create a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden border-t">
            {/* Queue List */}
            <ScrollArea className="h-[400px]">
              <div className="p-3 space-y-1">
                {queues.map((queue) => (
                  <button
                    key={queue.id}
                    onClick={() => selectQueue(queue.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm transition-colors text-left",
                      "hover:bg-accent"
                    )}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: queue.color }}
                    />
                    {queue.icon && <span className="text-base">{queue.icon}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{queue.name}</div>
                      {queue.schedule?.enabled && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {queue.schedule.start_time && `${queue.schedule.start_time}`}
                          {queue.schedule.start_time && queue.schedule.stop_time && ' - '}
                          {queue.schedule.stop_time && `${queue.schedule.stop_time}`}
                        </div>
                      )}
                    </div>
                    {queue.id === DEFAULT_QUEUE_ID && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-muted">default</span>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
            
            {/* New Queue Button */}
            <div className="p-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={startCreating}
              >
                <Plus className="h-4 w-4" />
                New Queue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Reuse QueueDialog for editing/creating */}
      <QueueDialog 
        open={showQueueDialog} 
        onOpenChange={(open) => {
          setShowQueueDialog(open);
          if (!open) {
            setEditingQueue(null);
          }
        }}
        editQueue={editingQueue}
      />
    </>
  );
}
