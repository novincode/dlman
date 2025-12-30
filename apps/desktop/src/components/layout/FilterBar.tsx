import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useDownloadStore,
  type DownloadFilter,
} from "@/stores/downloads";

const FILTERS: { value: DownloadFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "queued", label: "Queued" },
  { value: "failed", label: "Failed" },
];

export function FilterBar() {
  const { filter, searchQuery, setFilter, setSearchQuery } = useDownloadStore();

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b bg-card/50">
      {/* Filter Toggles */}
      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(value) => value && setFilter(value as DownloadFilter)}
        className="gap-1"
      >
        {FILTERS.map(({ value, label }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            size="sm"
            className="text-xs px-3"
          >
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search downloads..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>
    </div>
  );
}
