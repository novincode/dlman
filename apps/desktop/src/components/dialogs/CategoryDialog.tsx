import { useState, useEffect, useCallback } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { 
  Palette, 
  Save,
  Trash2,
  FileType,
  Folder,
  FolderOpen,
  Music,
  Film,
  FileText,
  Image,
  Archive,
  Box,
  Code,
  Database,
  Gamepad2,
  type LucideIcon,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCategoryStore, Category } from '@/stores/categories';
import { useUIStore } from '@/stores/ui';

// Predefined colors
const CATEGORY_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#eab308', '#0ea5e9', '#d946ef',
];

// Icon options using Lucide icons
interface IconOption {
  id: string;
  icon: LucideIcon;
  label: string;
}

const ICON_OPTIONS: IconOption[] = [
  { id: 'folder', icon: Folder, label: 'Folder' },
  { id: 'music', icon: Music, label: 'Music' },
  { id: 'film', icon: Film, label: 'Video' },
  { id: 'file-text', icon: FileText, label: 'Document' },
  { id: 'image', icon: Image, label: 'Image' },
  { id: 'archive', icon: Archive, label: 'Archive' },
  { id: 'box', icon: Box, label: 'Program' },
  { id: 'code', icon: Code, label: 'Code' },
  { id: 'database', icon: Database, label: 'Data' },
  { id: 'gamepad-2', icon: Gamepad2, label: 'Game' },
];

function getIconComponent(iconId: string): LucideIcon {
  const option = ICON_OPTIONS.find(opt => opt.id === iconId);
  return option?.icon || Folder;
}

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCategory?: Category | null;
  onCategoryCreated?: (categoryId: string) => void;
}

export function CategoryDialog({ open, onOpenChange, editCategory, onCategoryCreated }: CategoryDialogProps) {
  const { t } = useTranslation();
  const { addCategory, updateCategory, removeCategory } = useCategoryStore();

  // Literal t() keys so i18next-parser can extract the icon labels.
  const ICON_LABELS: Record<string, string> = {
    folder: t('categoryDialog.iconFolder'),
    music: t('categoryDialog.iconMusic'),
    film: t('categoryDialog.iconVideo'),
    'file-text': t('categoryDialog.iconDocument'),
    image: t('categoryDialog.iconImage'),
    archive: t('categoryDialog.iconArchive'),
    box: t('categoryDialog.iconProgram'),
    code: t('categoryDialog.iconCode'),
    database: t('categoryDialog.iconData'),
    'gamepad-2': t('categoryDialog.iconGame'),
  };

  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [iconId, setIconId] = useState('folder');
  const [extensions, setExtensions] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!editCategory;

  // Populate form when editing
  useEffect(() => {
    if (open && editCategory) {
      setName(editCategory.name);
      setColor(editCategory.color);
      setIconId(editCategory.icon);
      setExtensions(editCategory.extensions.join(', '));
      setCustomPath(editCategory.customPath || '');
    } else if (open) {
      // Reset for new category
      setName('');
      setColor(CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)]);
      setIconId('folder');
      setExtensions('');
      setCustomPath('');
    }
  }, [open, editCategory]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;

    try {
      setIsSaving(true);

      const extensionList = extensions
        .split(',')
        .map((ext) => ext.trim().toLowerCase().replace(/^\./, ''))
        .filter((ext) => ext.length > 0);

      if (isEditing && editCategory) {
        updateCategory(editCategory.id, {
          name,
          color,
          icon: iconId,
          extensions: extensionList,
          customPath: customPath || undefined,
        });
        onOpenChange(false);
      } else {
        const newCategory: Category = {
          id: crypto.randomUUID(),
          name,
          color,
          icon: iconId,
          extensions: extensionList,
          customPath: customPath || undefined,
        };
        addCategory(newCategory);
        onOpenChange(false);
        // Call callback with new category ID so parent can auto-select it
        onCategoryCreated?.(newCategory.id);
      }
    } catch (err) {
      console.error('Failed to save category:', err);
    } finally {
      setIsSaving(false);
    }
  }, [name, color, iconId, extensions, customPath, isEditing, editCategory, addCategory, updateCategory, onOpenChange, onCategoryCreated]);

  const handleDelete = useCallback(() => {
    if (!editCategory) return;
    removeCategory(editCategory.id);
    onOpenChange(false);
  }, [editCategory, removeCategory, onOpenChange]);

  const CurrentIcon = getIconComponent(iconId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('categoryDialog.editTitle') : t('categoryDialog.createTitle')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('categoryDialog.editDesc')
              : t('categoryDialog.createDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="category-name">{t('categoryDialog.name')}</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('categoryDialog.namePlaceholder')}
            />
          </div>

          {/* Color & Icon */}
          <div className="grid grid-cols-2 gap-4">
            {/* Color picker */}
            <div className="grid gap-2">
              <Label>{t('categoryDialog.color')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <div
                      className="w-4 h-4 rounded mr-2"
                      style={{ backgroundColor: color }}
                    />
                    <Palette className="h-4 w-4 mr-2" />
                    {t('categoryDialog.color')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3">
                  <div className="grid grid-cols-5 gap-2">
                    {CATEGORY_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`w-8 h-8 rounded-md transition-transform hover:scale-110 ${
                          color === c ? 'ring-2 ring-primary ring-offset-2' : ''
                        }`}
                        style={{ backgroundColor: c }}
                        onClick={() => setColor(c)}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Icon picker */}
            <div className="grid gap-2">
              <Label>{t('categoryDialog.icon')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CurrentIcon className="h-4 w-4 mr-2" style={{ color }} />
                    {t('categoryDialog.icon')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3">
                  <div className="grid grid-cols-5 gap-2">
                    {ICON_OPTIONS.map((option) => {
                      const IconComp = option.icon;
                      return (
                        <button
                          key={option.id}
                          className={`w-10 h-10 rounded-md flex flex-col items-center justify-center gap-0.5 hover:bg-accent ${
                            iconId === option.id ? 'ring-2 ring-primary ring-offset-2 bg-accent' : ''
                          }`}
                          onClick={() => setIconId(option.id)}
                          title={ICON_LABELS[option.id]}
                        >
                          <IconComp className="h-4 w-4" style={{ color }} />
                          <span className="text-[9px] text-muted-foreground">{ICON_LABELS[option.id]}</span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* File Extensions */}
          <div className="grid gap-2">
            <Label htmlFor="extensions" className="flex items-center gap-2">
              <FileType className="h-4 w-4" />
              {t('categoryDialog.fileExtensions')}
            </Label>
            <Input
              id="extensions"
              value={extensions}
              onChange={(e) => setExtensions(e.target.value)}
              placeholder={t('categoryDialog.extensionsPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('categoryDialog.extensionsHint')}
            </p>
          </div>

          {/* Custom Download Path */}
          <div className="grid gap-2">
            <Label htmlFor="custom-path">{t('categoryDialog.customPath')}</Label>
            <div className="flex gap-2">
              <Input
                id="custom-path"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder={t('categoryDialog.customPathPlaceholder')}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={async () => {
                  try {
                    const folderName = name || t('categoryDialog.categoryFallback');
                    const selected = await openDialog({
                      directory: true,
                      multiple: false,
                      title: t('categoryDialog.selectFolderTitle', { name: folderName }),
                    });
                    if (selected && typeof selected === 'string') {
                      setCustomPath(selected);
                    }
                  } catch (err) {
                    console.error('Failed to open folder picker:', err);
                  }
                }}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('categoryDialog.customPathHint')}
            </p>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {isEditing && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete')}
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? t('categoryDialog.saving') : isEditing ? t('categoryDialog.saveChanges') : t('categoryDialog.createButton')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Wrapper component that uses the UI store
export function CategoryManagerDialog() {
  const { showCategoryDialog, setShowCategoryDialog } = useUIStore();

  return (
    <CategoryDialog 
      open={showCategoryDialog} 
      onOpenChange={setShowCategoryDialog} 
    />
  );
}
