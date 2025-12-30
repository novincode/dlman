import { useMemo } from "react";
import { FilterBar } from "./FilterBar";
import { SelectionToolbar } from "./SelectionToolbar";
import { DownloadList } from "@/components/downloads/DownloadList";
import { EmptyState } from "@/components/downloads/EmptyState";
import { useDownloadStore, selectFilteredDownloads } from "@/stores/downloads";
import { useQueueStore } from "@/stores/queues";
import { useCategoryStore } from "@/stores/categories";
import { useShallow } from "zustand/react/shallow";

export function MainContent() {
  const hasDownloads = useDownloadStore((s) => s.downloads.size > 0);
  const baseFilteredDownloads = useDownloadStore(useShallow(selectFilteredDownloads));
  
  // Get selected queue and category
  const selectedQueueId = useQueueStore((s) => s.selectedQueueId);
  const selectedCategoryId = useCategoryStore((s) => s.selectedCategoryId);
  const categories = useCategoryStore((s) => s.categories);

  // Filter by queue and category
  const downloads = useMemo(() => {
    let filtered = baseFilteredDownloads;

    // Filter by queue
    if (selectedQueueId !== null) {
      filtered = filtered.filter((d) => d.queue_id === selectedQueueId);
    }

    // Filter by category (based on file extension)
    if (selectedCategoryId !== null) {
      const category = categories.get(selectedCategoryId);
      if (category) {
        filtered = filtered.filter((d) => {
          const ext = d.filename.split(".").pop()?.toLowerCase();
          return ext && category.extensions.includes(ext);
        });
      }
    }

    return filtered;
  }, [baseFilteredDownloads, selectedQueueId, selectedCategoryId, categories]);

  return (
    <div className="flex flex-col h-full">
      {/* Filter Bar */}
      <FilterBar />

      {/* Selection Toolbar (shows when items are selected) */}
      <SelectionToolbar />

      {/* Download List */}
      <div className="flex-1 overflow-hidden">
        {downloads.length > 0 ? (
          <DownloadList downloads={downloads} />
        ) : (
          <EmptyState hasAnyDownloads={hasDownloads} />
        )}
      </div>
    </div>
  );
}
