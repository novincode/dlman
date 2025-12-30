import { FilterBar } from "./FilterBar";
import { DownloadList } from "@/components/downloads/DownloadList";
import { EmptyState } from "@/components/downloads/EmptyState";
import { useDownloadStore, useFilteredDownloads } from "@/stores/downloads";

export function MainContent() {
  const downloads = useFilteredDownloads();
  const hasDownloads = useDownloadStore((s) => s.downloads.size > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Filter Bar */}
      <FilterBar />

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
