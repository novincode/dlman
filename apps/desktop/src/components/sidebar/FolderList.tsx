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
import { cn } from "@/lib/utils";
import { useCategoryStore, useCategoriesArray, Category } from "@/stores/categories";
import { CategoryDialog } from "@/components/dialogs/CategoryDialog";

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

  const handleContextMenu = useCallback((e: React.MouseEvent, _category: Category) => {
    e.preventDefault();
    // Could show custom context menu here
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
                {categories.map((category) => (
                  <div
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    onContextMenu={(e) => handleContextMenu(e, category)}
                    data-context-menu="category"
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors group",
                      selectedCategoryId === category.id
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="text-sm">{category.icon}</span>
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
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditCategory(category); }}>
                          <Smile className="h-4 w-4 mr-2" />
                          Change Icon
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
                ))}

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
