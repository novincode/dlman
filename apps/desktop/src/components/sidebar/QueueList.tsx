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
  Smile,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueueStore, useQueuesArray, DEFAULT_QUEUE_ID } from "@/stores/queues";
import { cn } from "@/lib/utils";
import { QueueDialog } from "@/components/dialogs/QueueDialog";
import type { Queue } from "@/types";

export function QueueList() {
  const [expanded, setExpanded] = useState(true);
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null);
  const [showQueueDialog, setShowQueueDialog] = useState(false);
  const queues = useQueuesArray();
  const { selectedQueueId, setSelectedQueue } = useQueueStore();

  const handleAddQueue = useCallback(() => {
    setEditingQueue(null);
    setShowQueueDialog(true);
  }, []);

  const handleEditQueue = useCallback((queue: Queue) => {
    setEditingQueue(queue);
    setShowQueueDialog(true);
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
                <QueueItem
                  name="All Downloads"
                  color="#6b7280"
                  isSelected={selectedQueueId === null}
                  onClick={() => setSelectedQueue(null)}
                />

                {/* Individual Queues */}
                {queues.map((queue) => (
                  <QueueItem
                    key={queue.id}
                    queue={queue}
                    name={queue.name}
                    color={queue.color}
                    icon={queue.icon}
                    isSelected={selectedQueueId === queue.id}
                    isDefault={queue.id === DEFAULT_QUEUE_ID}
                    onClick={() => setSelectedQueue(queue.id)}
                    onEdit={() => handleEditQueue(queue)}
                  />
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
  queue?: Queue;
  name: string;
  color: string;
  icon?: string | null;
  isSelected?: boolean;
  isDefault?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
}

function QueueItem({
  queue,
  name,
  color,
  icon,
  isSelected,
  isDefault,
  onClick,
  onEdit,
}: QueueItemProps) {
  const { removeQueue } = useQueueStore();

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (queue && queue.id !== DEFAULT_QUEUE_ID) {
      removeQueue(queue.id);
    }
  }, [queue, removeQueue]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!isDefault && name !== "All Downloads" && onEdit) {
      e.preventDefault();
      // Could show custom context menu here
    }
  }, [isDefault, name, onEdit]);

  return (
    <div
      onClick={onClick}
      onContextMenu={handleContextMenu}
      data-context-menu="queue"
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors group",
        isSelected
          ? "bg-primary/10 text-foreground"
          : "hover:bg-accent text-muted-foreground hover:text-foreground"
      )}
    >
      {/* Color indicator or icon */}
      {icon ? (
        <span className="text-sm">{icon}</span>
      ) : (
        <div
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
        />
      )}

      {/* Name */}
      <span className="text-sm truncate flex-1">{name}</span>

      {/* More menu (not for "All Downloads" or default queue) */}
      {!isDefault && name !== "All Downloads" && queue && (
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
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Queue
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
              <Palette className="h-4 w-4 mr-2" />
              Change Color
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
              <Smile className="h-4 w-4 mr-2" />
              Change Icon
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Queue
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
