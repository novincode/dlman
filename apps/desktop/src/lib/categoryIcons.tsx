// Category icons mapping - using Lucide icons instead of emojis for better design
import {
  Music,
  Film,
  FileText,
  Image,
  Archive,
  Box,
  Folder,
  Code,
  Database,
  Gamepad2,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryIconConfig {
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

// Map category IDs to their icon configurations
export const CATEGORY_ICONS: Record<string, CategoryIconConfig> = {
  music: {
    icon: Music,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  videos: {
    icon: Film,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  documents: {
    icon: FileText,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  images: {
    icon: Image,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  archives: {
    icon: Archive,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  programs: {
    icon: Box,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  code: {
    icon: Code,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  data: {
    icon: Database,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
  },
  games: {
    icon: Gamepad2,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
  },
};

// Default icon for unknown categories
export const DEFAULT_CATEGORY_ICON: CategoryIconConfig = {
  icon: Folder,
  color: 'text-muted-foreground',
  bgColor: 'bg-muted',
};

// Get icon config by category ID or name
export function getCategoryIcon(id: string, name?: string): CategoryIconConfig {
  // Check by ID first
  if (CATEGORY_ICONS[id.toLowerCase()]) {
    return CATEGORY_ICONS[id.toLowerCase()];
  }
  
  // Check by name
  if (name) {
    const normalizedName = name.toLowerCase();
    for (const [key, config] of Object.entries(CATEGORY_ICONS)) {
      if (normalizedName.includes(key)) {
        return config;
      }
    }
  }
  
  return DEFAULT_CATEGORY_ICON;
}

// Icon picker options for category dialog - using Lucide icons with labels
export interface IconOption {
  id: string;
  icon: LucideIcon;
  label: string;
}

export const ICON_OPTIONS: IconOption[] = [
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

export function getIconComponent(iconId: string): LucideIcon {
  const option = ICON_OPTIONS.find(opt => opt.id === iconId);
  return option?.icon || Folder;
}
