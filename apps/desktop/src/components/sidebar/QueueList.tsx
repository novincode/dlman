import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  ListTodo,
  MoreHorizontal,
  Edit,
  Palette,
  Trash2,
  Play,
  Pause,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useQueueStore, useQueuesArray, DEFAULT_QUEUE_ID } from "@/stores/queues";
import { cn } from "@/lib/utils";
import { QueueDialog } from "@/components/dialogs/QueueDialog";
import { DroppableSidebarItem } from "@/components/dnd/DroppableSidebarItem";
import type { Queue } from "@/types";

export function QueueList() {
  const [expanded, setExpanded] = useState(true);
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null);
  const [showQueueDialog, setShowQueueDialog] = useState(false);
  const queues = useQueuesArray();
  const { selectedQueueId, setSelectedQueue, removeQueue } = useQueueStore();

  const handleAddQueue = useCallback(() => {
    setEditingQueue(null);
    setShowQueueDialog(true);
  }, []);

  const handleEditQueue = useCallback((queue: Queue) => {
    setEditingQueue(queue);
    setShowQueueDialog(true);
  }, []);

  const handleDeleteQueue = useCallback((queue: Queue) => {
    if (queue.id !== DEFAULT_QUEUE_ID) {
      removeQueue(queue.id);
    }
  }, [removeQueue]);

  const handleStartQueue = useCallback(async (queue: Queue) => {
    try {
      await invoke('start_queue', { id: queue.id });
      toast.success(`Started queue "${queue.name}"`);
    } catch (error) {
      console.error('Failed to start queue:', error);
      toast.error('Failed to start queue');
    }
  }, []);

  const handlePauseQueue = useCallback(async (queue: Queue) => {
    try {
      await invoke('stop_queue', { id: queue.id });
      toast.success(`Stopped queue "${queue.name}"`);
    } catch (error) {
      console.error('Failed to stop queue:', error);
      toast.error('Failed to stop queue');
    }
  }, []);

  return (
    <>
      <div>
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <ListTodo className="h-3 w-3 mr-1" />
          QUEUES
          <span className="ml-auto text-xs opacity-60">{queues.length}</span>
        </button>

        {/* Queue Items */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-1 space-y-0.5">
                {/* All Downloads */}
                <div
                  onClick={() => setSelectedQueue(null)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors group",
                    selectedQueueId === null
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: "#6b7280" }}
                  />
                  <span className="text-sm truncate flex-1">All Downloads</span>
                </div>

                {/* Individual Queues */}
                {queues.map((queue) => (
                  <DroppableSidebarItem key={queue.id} id={queue.id} type="queue">
                    <QueueItem
                      queue={queue}
                      isSelected={selectedQueueId === queue.id}
                      isDefault={queue.id === DEFAULT_QUEUE_ID}
                      onClick={() => setSelectedQueue(queue.id)}
                      onEdit={() => handleEditQueue(queue)}
                      onDelete={() => handleDeleteQueue(queue)}
                      onStart={() => handleStartQueue(queue)}
                      onPause={() => handlePauseQueue(queue)}
                    />
                  </DroppableSidebarItem>
                ))}

                {/* Add Queue Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleAddQueue}
                >
                  <Plus className="h-3 w-3 mr-2" />
                  Add Queue
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Queue Dialog */}
      <QueueDialog
        open={showQueueDialog}
        onOpenChange={setShowQueueDialog}
        editQueue={editingQueue}
      />
    </>
  );
}

interface QueueItemProps {
  queue: Queue;
  isSelected?: boolean;
  isDefault?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onStart?: () => void;
  onPause?: () => void;
}

function QueueItem({
  queue,
  isSelected,
  isDefault,
  onClick,
  onEdit,
  onDelete,
  onStart,
  onPause,
}: QueueItemProps) {

  const renderMenuItems = (isDropdown: boolean) => {
    const MenuItem = isDropdown ? DropdownMenuItem : ContextMenuItem;
    const MenuSeparator = isDropdown ? DropdownMenuSeparator : ContextMenuSeparator;

    return (
      <>
        <MenuItem onClick={(e) => { e.stopPropagation(); onStart?.(); }}>
          <Play className="h-4 w-4 mr-2" />
          Start All
        </MenuItem>
        <MenuItem onClick={(e) => { e.stopPropagation(); onPause?.(); }}>
          <Pause className="h-4 w-4 mr-2" />
          Pause All
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
          <Edit className="h-4 w-4 mr-2" />
          Edit Queue
        </MenuItem>
        <MenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
          <Palette className="h-4 w-4 mr-2" />
          Change Color
        </MenuItem>
        {!isDefault && (
          <>
            <MenuSeparator />
            <MenuItem 
              className="text-destructive focus:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Queue
            </MenuItem>
          </>
        )}
      </>
    );
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={onClick}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all group",
            isSelected
              ? "bg-primary/10 text-foreground"
              : "hover:bg-accent text-muted-foreground hover:text-foreground",
          )}
        >
          {/* Color indicator or icon */}
          {queue.icon ? (
            <span className="text-sm">{queue.icon}</span>
          ) : (
            <div
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: queue.color }}
            />
          )}

          {/* Name */}
          <span className="text-sm truncate flex-1">{queue.name}</span>

          {/* More menu (not for default queue) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {renderMenuItems(true)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {renderMenuItems(false)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
