import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useUIStore } from "@/stores/ui";
import { useDownloadStore } from "@/stores/downloads";
import { toast } from "sonner";

export type DndItemType = "download" | "queue" | "category";

export interface DndItem {
  id: string;
  type: DndItemType;
  data: any;
}

interface DndProviderProps {
  children: React.ReactNode;
}

export function DndProvider({ children }: DndProviderProps) {
  const { setIsDragging } = useUIStore();
  const { moveToQueue } = useDownloadStore();
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.data.current && over.data.current) {
      const sourceType = active.data.current.type as DndItemType;
      const destinationType = over.data.current.type as DndItemType;
      const destinationId = over.data.current.id as string;

      if (sourceType === "download") {
        const downloadId = active.id.toString().replace('download-', '');
        
        if (destinationType === "queue") {
          moveToQueue([downloadId], destinationId);
          toast.success("Moved to queue");
        } else if (destinationType === "category") {
          // TODO: Implement move to category if needed
          console.log(`Move download ${downloadId} to category ${destinationId}`);
        }
      }
    }
    
    setIsDragging(false);
  };

  const handleDragCancel = () => {
    setIsDragging(false);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
    </DndContext>
  );
}
