import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { Download, DownloadStatus } from "@/types";

interface DownloadWithProgress extends Download {
  speed?: number;
  eta?: number | null;
}

interface DownloadState {
  // State
  downloads: Map<string, DownloadWithProgress>;
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  filter: DownloadFilter;
  searchQuery: string;
  sortBy: SortField;
  sortOrder: "asc" | "desc";

  // Actions
  addDownload: (download: Download) => void;
  removeDownload: (id: string) => void;
  updateDownload: (id: string, updates: Partial<Download>) => void;
  updateProgress: (
    id: string,
    downloaded: number,
    total: number | null,
    speed: number,
    eta: number | null
  ) => void;
  updateSegmentProgress: (
    id: string,
    segmentIndex: number,
    downloaded: number
  ) => void;
  updateStatus: (
    id: string,
    status: DownloadStatus,
    error: string | null
  ) => void;
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string, shiftKey?: boolean) => void;
  selectRange: (fromId: string, toId: string) => void;
  selectAll: (ids?: string[]) => void;
  clearSelection: () => void;
  setFilter: (filter: DownloadFilter) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (field: SortField) => void;
  setSortOrder: (order: "asc" | "desc") => void;
  moveToQueue: (ids: string[], queueId: string) => void;
  setDownloads: (downloads: Download[]) => void;
}

export type DownloadFilter =
  | "all"
  | "active"
  | "completed"
  | "failed"
  | "queued"
  | "paused";

export type SortField = "name" | "size" | "progress" | "date" | "status";

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      // Initial state
      downloads: new Map(),
      selectedIds: new Set(),
      lastSelectedId: null,
      filter: "all",
      searchQuery: "",
      sortBy: "date",
      sortOrder: "desc",

      // Actions
      addDownload: (download) =>
        set((state) => {
          const downloads = new Map(state.downloads);
          downloads.set(download.id, download);
          return { downloads };
        }),

      removeDownload: (id) =>
        set((state) => {
          const downloads = new Map(state.downloads);
          downloads.delete(id);
          const selectedIds = new Set(state.selectedIds);
          selectedIds.delete(id);
          return { downloads, selectedIds };
        }),

      updateDownload: (id, updates) =>
        set((state) => {
          const downloads = new Map(state.downloads);
          const download = downloads.get(id);
          if (download) {
            downloads.set(id, { ...download, ...updates });
          }
          return { downloads };
        }),

      updateProgress: (id, downloaded, total, speed, eta) =>
        set((state) => {
          const downloads = new Map(state.downloads);
          const download = downloads.get(id);
          if (download) {
            downloads.set(id, {
              ...download,
              downloaded,
              speed,
              eta,
              // Update size from total if we got a value and don't have one yet (or it's different)
              size: total ?? download.size,
            });
          }
          return { downloads };
        }),

      updateSegmentProgress: (id, segmentIndex, downloaded) =>
        set((state) => {
          const downloads = new Map(state.downloads);
          const download = downloads.get(id);
          if (download && download.segments[segmentIndex]) {
            const segments = [...download.segments];
            segments[segmentIndex] = { ...segments[segmentIndex], downloaded };
            downloads.set(id, { ...download, segments });
          }
          return { downloads };
        }),

      updateStatus: (id, status, error) =>
        set((state) => {
          const downloads = new Map(state.downloads);
          const download = downloads.get(id);
          if (download) {
            downloads.set(id, {
              ...download,
              status,
              error,
              // When completed, set downloaded to size to ensure they match
              downloaded: status === "completed" ? (download.size ?? download.downloaded) : download.downloaded,
              completed_at:
                status === "completed" ? new Date().toISOString() : download.completed_at,
            });
          }
          return { downloads };
        }),

      setSelected: (ids) => set({ selectedIds: new Set(ids), lastSelectedId: ids[ids.length - 1] ?? null }),

      toggleSelected: (id, shiftKey = false) => {
        const state = get();
        
        // If shift is held and we have a last selected id, select range
        if (shiftKey && state.lastSelectedId && state.lastSelectedId !== id) {
          // Get sorted download IDs
          const sortedIds = selectFilteredDownloads(state).map(d => d.id);
          const fromIndex = sortedIds.indexOf(state.lastSelectedId);
          const toIndex = sortedIds.indexOf(id);
          
          if (fromIndex !== -1 && toIndex !== -1) {
            const start = Math.min(fromIndex, toIndex);
            const end = Math.max(fromIndex, toIndex);
            const rangeIds = sortedIds.slice(start, end + 1);
            
            const selectedIds = new Set(state.selectedIds);
            rangeIds.forEach(rangeId => selectedIds.add(rangeId));
            
            set({ selectedIds, lastSelectedId: id });
            return;
          }
        }
        
        // Normal toggle
        const selectedIds = new Set(state.selectedIds);
        if (selectedIds.has(id)) {
          selectedIds.delete(id);
        } else {
          selectedIds.add(id);
        }
        set({ selectedIds, lastSelectedId: id });
      },

      selectRange: (fromId, toId) => {
        const state = get();
        const sortedIds = selectFilteredDownloads(state).map(d => d.id);
        const fromIndex = sortedIds.indexOf(fromId);
        const toIndex = sortedIds.indexOf(toId);
        
        if (fromIndex === -1 || toIndex === -1) return;
        
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        const rangeIds = sortedIds.slice(start, end + 1);
        
        const selectedIds = new Set(state.selectedIds);
        rangeIds.forEach(id => selectedIds.add(id));
        
        set({ selectedIds, lastSelectedId: toId });
      },

      selectAll: (ids) =>
        set((state) => ({
          selectedIds: new Set(ids ?? state.downloads.keys()),
        })),

      clearSelection: () => set({ selectedIds: new Set(), lastSelectedId: null }),

      setFilter: (filter) => set({ filter }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      setSortBy: (sortBy) => set({ sortBy }),

      setSortOrder: (sortOrder) => set({ sortOrder }),

      moveToQueue: (ids, queueId) =>
        set((state) => {
          const downloads = new Map(state.downloads);
          for (const id of ids) {
            const download = downloads.get(id);
            if (download) {
              downloads.set(id, { ...download, queue_id: queueId });
            }
          }
          return { downloads };
        }),

      setDownloads: (downloadList) =>
        set(() => {
          const downloads = new Map<string, DownloadWithProgress>();
          for (const download of downloadList) {
            downloads.set(download.id, download);
          }
          return { downloads };
        }),
    }),
    {
      name: "dlman-downloads",
      // Custom storage to handle Map and Set serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          try {
            const parsed = JSON.parse(str);
            // Convert downloads array back to Map
            if (parsed.state?.downloads) {
              parsed.state.downloads = new Map(
                Array.isArray(parsed.state.downloads)
                  ? parsed.state.downloads
                  : Object.entries(parsed.state.downloads)
              );
            }
            // Convert selectedIds array back to Set
            if (parsed.state?.selectedIds) {
              parsed.state.selectedIds = new Set(
                Array.isArray(parsed.state.selectedIds)
                  ? parsed.state.selectedIds
                  : []
              );
            }
            return parsed;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          const serialized = {
            ...value,
            state: {
              ...value.state,
              // Convert Map to array of entries
              downloads: Array.from(value.state.downloads?.entries() ?? []),
              // Convert Set to array
              selectedIds: Array.from(value.state.selectedIds ?? []),
            },
          };
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      // Only persist downloads and filter settings, not selections
      partialize: (state) => ({
        downloads: state.downloads,
        filter: state.filter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        searchQuery: "",
        selectedIds: new Set<string>(),
        lastSelectedId: null,
        // Actions need to be included for type compatibility but won't be serialized
        addDownload: state.addDownload,
        removeDownload: state.removeDownload,
        updateDownload: state.updateDownload,
        updateProgress: state.updateProgress,
        updateSegmentProgress: state.updateSegmentProgress,
        updateStatus: state.updateStatus,
        setSelected: state.setSelected,
        toggleSelected: state.toggleSelected,
        selectRange: state.selectRange,
        selectAll: state.selectAll,
        clearSelection: state.clearSelection,
        setFilter: state.setFilter,
        setSearchQuery: state.setSearchQuery,
        setSortBy: state.setSortBy,
        setSortOrder: state.setSortOrder,
        moveToQueue: state.moveToQueue,
        setDownloads: state.setDownloads,
      }),
    }
  )
);

// Selectors
export const selectFilteredDownloads = (state: DownloadState) => {
  let downloads = Array.from(state.downloads.values());

  // Apply filter
  if (state.filter !== "all") {
    downloads = downloads.filter((d) => {
      switch (state.filter) {
        case "active":
          return d.status === "downloading";
        case "completed":
          return d.status === "completed";
        case "failed":
          return d.status === "failed";
        case "queued":
          return d.status === "queued" || d.status === "pending";
        case "paused":
          return d.status === "paused";
        default:
          return true;
      }
    });
  }

  // Apply search
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    downloads = downloads.filter(
      (d) =>
        d.filename.toLowerCase().includes(query) ||
        d.url.toLowerCase().includes(query)
    );
  }

  // Apply sort
  downloads.sort((a, b) => {
    let comparison = 0;
    switch (state.sortBy) {
      case "name":
        comparison = a.filename.localeCompare(b.filename);
        break;
      case "size":
        comparison = (a.size || 0) - (b.size || 0);
        break;
      case "progress":
        const progressA = a.size ? a.downloaded / a.size : 0;
        const progressB = b.size ? b.downloaded / b.size : 0;
        comparison = progressA - progressB;
        break;
      case "date":
        comparison =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case "status":
        comparison = a.status.localeCompare(b.status);
        break;
    }
    return state.sortOrder === "asc" ? comparison : -comparison;
  });

  return downloads;
};

// Hook for getting filtered downloads with stable reference
export const useFilteredDownloads = () =>
  useDownloadStore(useShallow(selectFilteredDownloads));
