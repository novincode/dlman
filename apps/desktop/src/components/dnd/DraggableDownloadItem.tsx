import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

interface DraggableDownloadItemProps {
  id: string;
  children: React.ReactNode;
  data?: any;
}

export function DraggableDownloadItem({ id, children, data }: DraggableDownloadItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `download-${id}`,
    data: {
      type: "download",
      id,
      data,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : undefined,
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}
