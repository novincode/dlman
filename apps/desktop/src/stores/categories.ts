import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

export interface Category {
  id: string;
  name: string;
  icon: string;  // Icon ID (e.g., 'music', 'film', 'file-text') - not emoji
  color: string;
  extensions: string[]; // File extensions that belong to this category
  customPath?: string;  // Optional custom download path for this category
}

interface CategoryState {
  // State
  categories: Map<string, Category>;
  selectedCategoryId: string | null;

  // Actions
  addCategory: (category: Category) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  removeCategory: (id: string) => void;
  setSelectedCategory: (id: string | null) => void;
}

// Default categories with icon IDs instead of emojis
const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'music',
    name: 'Music',
    icon: 'music',
    color: '#22c55e',
    extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'],
  },
  {
    id: 'videos',
    name: 'Videos',
    icon: 'film',
    color: '#ef4444',
    extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'],
  },
  {
    id: 'documents',
    name: 'Documents',
    icon: 'file-text',
    color: '#3b82f6',
    extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'],
  },
  {
    id: 'images',
    name: 'Images',
    icon: 'image',
    color: '#a855f7',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'],
  },
  {
    id: 'archives',
    name: 'Archives',
    icon: 'archive',
    color: '#f59e0b',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  },
  {
    id: 'programs',
    name: 'Programs',
    icon: 'box',
    color: '#06b6d4',
    extensions: ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'app'],
  },
];

const initialCategories = new Map<string, Category>(
  DEFAULT_CATEGORIES.map((cat) => [cat.id, cat])
);

export const useCategoryStore = create<CategoryState>()(
  persist(
    (set) => ({
      categories: initialCategories,
      selectedCategoryId: null,

      addCategory: (category) =>
        set((state) => {
          const categories = new Map(state.categories);
          categories.set(category.id, category);
          return { categories };
        }),

      updateCategory: (id, updates) =>
        set((state) => {
          const categories = new Map(state.categories);
          const category = categories.get(id);
          if (category) {
            categories.set(id, { ...category, ...updates });
          }
          return { categories };
        }),

      removeCategory: (id) =>
        set((state) => {
          const categories = new Map(state.categories);
          categories.delete(id);
          return {
            categories,
            selectedCategoryId:
              state.selectedCategoryId === id ? null : state.selectedCategoryId,
          };
        }),

      setSelectedCategory: (id) => set({ selectedCategoryId: id }),
    }),
    {
      name: "dlman-categories",
      partialize: (state) => ({
        categories: Array.from(state.categories.entries()),
        selectedCategoryId: state.selectedCategoryId,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as {
          categories: [string, Category][];
          selectedCategoryId: string | null;
        };
        return {
          ...current,
          categories: persistedState.categories?.length 
            ? new Map(persistedState.categories)
            : current.categories,
          selectedCategoryId: persistedState.selectedCategoryId,
        };
      },
    }
  )
);

// Selectors
export const useCategoriesArray = () =>
  useCategoryStore(useShallow((state) => Array.from(state.categories.values())));

export const selectCategoryById = (id: string) => (state: CategoryState) =>
  state.categories.get(id);
