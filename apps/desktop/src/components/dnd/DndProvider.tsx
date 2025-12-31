import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  rectIntersection,
} from "@dnd-kit/core";
import { useState } from "react";
import { useUIStore } from "@/stores/ui";
import { useDownloadStore } from "@/stores/downloads";
import { useCategoryStore } from "@/stores/categories";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";

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
  const { moveToQueue, selectedIds, updateDownload } = useDownloadStore();
  const { categories } = useCategoryStore();
  const [activeItem, setActiveItem] = useState<DndItem | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 15, // Increased to 15px to prevent accidental drags
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setIsDragging(true);
    setActiveItem({
      id: active.data.current?.id || active.id.toString(),
      type: active.data.current?.type as DndItemType,
      data: active.data.current?.data,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.data.current && over.data.current) {
      const sourceType = active.data.current.type as DndItemType;
      const destinationType = over.data.current.type as DndItemType;
      const destinationId = over.data.current.id as string;

      if (sourceType === "download") {
        const downloadId = active.data.current.id as string;
        
        const idsToMove = selectedIds.has(downloadId)
          ? Array.from(selectedIds)
          : [downloadId];
        
        if (destinationType === "queue") {
          moveToQueue(idsToMove, destinationId);
          toast.success(`Moved ${idsToMove.length} item${idsToMove.length > 1 ? 's' : ''} to queue`);
        } else if (destinationType === "category") {
          const category = categories.get(destinationId);
          if (category) {
            // Update local state immediately
            idsToMove.forEach((id) => {
              updateDownload(id, { category_id: destinationId });
            });
            
            // Update backend
            idsToMove.forEach(async (id) => {
              try {
                await invoke("update_download", { 
                  id, 
                  updates: { category_id: destinationId }
                });
              } catch (err) {
                console.error("Failed to update download category:", err);
                // Revert local state on failure
                updateDownload(id, { category_id: null }); // or previous value, but we don't have it
                toast.error("Failed to move item to category");
              }
            });
            
            toast.success(`Moved ${idsToMove.length} item${idsToMove.length > 1 ? 's' : ''} to ${category.name} category`);
          }
        }
      }
    }
    
    setIsDragging(false);
    setActiveItem(null);
  };

  const handleDragCancel = () => {
    setIsDragging(false);
    setActiveItem(null);
  };

  const dropAnimationConfig = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.5",
        },
      },
    }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      {createPortal(
        <DragOverlay dropAnimation={dropAnimationConfig}>
          {activeItem ? (
            <div className="bg-primary text-primary-foreground px-3 py-2 rounded-lg shadow-xl border border-primary-foreground/20 flex items-center gap-2">
              <div className="bg-primary-foreground/20 rounded-md px-1.5 py-0.5 text-xs font-bold">
                {selectedIds.has(activeItem.id) ? selectedIds.size : 1}
              </div>
              <span className="text-sm font-medium">
                {selectedIds.has(activeItem.id) && selectedIds.size > 1 
                  ? "Items" 
                  : activeItem.data?.filename || "Download"}
              </span>
            </div>
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
