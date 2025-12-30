import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  ListTodo,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueueStore, useQueuesArray, DEFAULT_QUEUE_ID } from "@/stores/queues";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

export function QueueList() {
  const [expanded, setExpanded] = useState(true);
  const queues = useQueuesArray();
  const { selectedQueueId, setSelectedQueue } = useQueueStore();
  const { setShowQueueManagerDialog } = useUIStore();

  return (
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
                  name={queue.name}
                  color={queue.color}
                  icon={queue.icon}
                  isSelected={selectedQueueId === queue.id}
                  isDefault={queue.id === DEFAULT_QUEUE_ID}
                  onClick={() => setSelectedQueue(queue.id)}
                />
              ))}

              {/* Add Queue Button */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowQueueManagerDialog(true)}
              >
                <Plus className="h-3 w-3 mr-2" />
                Add Queue
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface QueueItemProps {
  name: string;
  color: string;
  icon?: string | null;
  isSelected?: boolean;
  isDefault?: boolean;
  onClick?: () => void;
}

function QueueItem({
  name,
  color,
  icon,
  isSelected,
  isDefault,
  onClick,
}: QueueItemProps) {
  return (
    <div
      onClick={onClick}
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

      {/* More menu (not for "All Downloads") */}
      {!isDefault && name !== "All Downloads" && (
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
            <DropdownMenuItem>Edit Queue</DropdownMenuItem>
            <DropdownMenuItem>Change Color</DropdownMenuItem>
            <DropdownMenuItem>Change Icon</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              Delete Queue
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
