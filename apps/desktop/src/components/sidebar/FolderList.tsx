import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  MoreHorizontal,
  Edit,
  Palette,
  Trash2,
  Music,
  Film,
  FileText,
  Image,
  Archive,
  Box,
  type LucideIcon,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useCategoryStore, useCategoriesArray, Category } from "@/stores/categories";
import { CategoryDialog } from "@/components/dialogs/CategoryDialog";
import { DroppableSidebarItem } from "@/components/dnd/DroppableSidebarItem";

// Map category IDs to icons
const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  music: Music,
  videos: Film,
  documents: FileText,
  images: Image,
  archives: Archive,
  programs: Box,
};

function getCategoryIcon(catId: string): LucideIcon {
  return CATEGORY_ICON_MAP[catId] || Folder;
}

export function FolderList() {
  const [expanded, setExpanded] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const categories = useCategoriesArray();
  const { selectedCategoryId, setSelectedCategory, removeCategory } = useCategoryStore();

  const handleAddCategory = useCallback(() => {
    setEditingCategory(null);
    setShowCategoryDialog(true);
  }, []);

  const handleEditCategory = useCallback((category: Category) => {
    setEditingCategory(category);
    setShowCategoryDialog(true);
  }, []);

  const handleDeleteCategory = useCallback((id: string) => {
    removeCategory(id);
  }, [removeCategory]);

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
          <Folder className="h-3 w-3 mr-1" />
          CATEGORIES
          <span className="ml-auto text-xs opacity-60">{categories.length}</span>
        </button>

        {/* Category Items */}
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
                {/* All Categories option */}
                <div
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors group",
                    selectedCategoryId === null
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate flex-1">All Categories</span>
                </div>

                {categories.map((category) => {
                  const IconComponent = getCategoryIcon(category.id);
                  
                  return (
                    <DroppableSidebarItem key={category.id} id={category.id} type="category">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div
                            onClick={() => setSelectedCategory(category.id)}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors group",
                              selectedCategoryId === category.id
                                ? "bg-primary/10 text-foreground"
                                : "hover:bg-accent text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <div
                              className="flex items-center justify-center w-5 h-5 rounded"
                              style={{ backgroundColor: `${category.color}20` }}
                            >
                              <IconComponent
                                className="h-3.5 w-3.5"
                                style={{ color: category.color }}
                              />
                            </div>
                            <span className="text-sm truncate flex-1">
                              {category.name}
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
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditCategory(category); }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Category
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditCategory(category); }}>
                                  <Palette className="h-4 w-4 mr-2" />
                                  Change Color
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-destructive focus:text-destructive"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Category
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => handleEditCategory(category)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Category
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleEditCategory(category)}>
                            <Palette className="h-4 w-4 mr-2" />
                            Change Color
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteCategory(category.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Category
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </DroppableSidebarItem>
                  );
                })}


                {/* Add Category Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleAddCategory}
                >
                  <Plus className="h-3 w-3 mr-2" />
                  Add Category
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Category Dialog */}
      <CategoryDialog
        open={showCategoryDialog}
        onOpenChange={setShowCategoryDialog}
        editCategory={editingCategory}
      />
    </>
  );
}
