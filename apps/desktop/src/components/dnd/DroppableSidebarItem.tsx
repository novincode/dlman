import { useDroppable } from "@dnd-kit/core";

interface DroppableSidebarItemProps {
  id: string;
  type: "queue" | "category";
  children: React.ReactNode;
  data?: any;
}

export function DroppableSidebarItem({ id, type, children, data }: DroppableSidebarItemProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${type}-${id}`,
    data: {
      type,
      id,
      data,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md transition-colors ${
        isOver ? "bg-accent/50 ring-2 ring-primary/50" : ""
      }`}
    >
      {children}
    </div>
  );
}
