import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  Music,
  Video,
  FileText,
  Image,
  Archive,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Default folder categories
const DEFAULT_FOLDERS = [
  { id: "music", name: "Music", icon: Music, color: "#22c55e" },
  { id: "videos", name: "Videos", icon: Video, color: "#ef4444" },
  { id: "documents", name: "Documents", icon: FileText, color: "#3b82f6" },
  { id: "images", name: "Images", icon: Image, color: "#a855f7" },
  { id: "archives", name: "Archives", icon: Archive, color: "#f59e0b" },
];

export function FolderList() {
  const [expanded, setExpanded] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

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
        <Folder className="h-3 w-3 mr-1" />
        CATEGORIES
      </button>

      {/* Folder Items */}
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
              {DEFAULT_FOLDERS.map((folder) => {
                const Icon = folder.icon;
                return (
                  <div
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors group",
                      selectedFolder === folder.id
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: folder.color }}
                    />
                    <span className="text-sm truncate flex-1">
                      {folder.name}
                    </span>

                    {/* More menu */}
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
                        <DropdownMenuItem>Rename</DropdownMenuItem>
                        <DropdownMenuItem>Change Icon</DropdownMenuItem>
                        <DropdownMenuItem>Change Color</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}

              {/* Add Folder Button */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3 mr-2" />
                Add Category
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
