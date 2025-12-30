import { create } from "zustand";
import type { Download, DownloadStatus } from "@/types";

interface DownloadWithProgress extends Download {
  speed?: number;
  eta?: number | null;
}

interface DownloadState {
  // State
  downloads: Map<string, DownloadWithProgress>;
  selectedIds: Set<string>;
  filter: DownloadFilter;
  searchQuery: string;
  sortBy: SortField;
  sortOrder: "asc" | "desc";

  // Actions
  addDownload: (download: Download) => void;
  removeDownload: (id: string) => void;
  updateProgress: (
    id: string,
    downloaded: number,
    speed: number,
    eta: number | null
  ) => void;
  updateStatus: (
    id: string,
    status: DownloadStatus,
    error: string | null
  ) => void;
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
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

export const useDownloadStore = create<DownloadState>((set, get) => ({
  // Initial state
  downloads: new Map(),
  selectedIds: new Set(),
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

  updateProgress: (id, downloaded, speed, eta) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      const download = downloads.get(id);
      if (download) {
        downloads.set(id, { ...download, downloaded, speed, eta });
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
          completed_at:
            status === "completed" ? new Date().toISOString() : download.completed_at,
        });
      }
      return { downloads };
    }),

  setSelected: (ids) => set({ selectedIds: new Set(ids) }),

  toggleSelected: (id) =>
    set((state) => {
      const selectedIds = new Set(state.selectedIds);
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }
      return { selectedIds };
    }),

  selectAll: () =>
    set((state) => ({
      selectedIds: new Set(state.downloads.keys()),
    })),

  clearSelection: () => set({ selectedIds: new Set() }),

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
}));

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
