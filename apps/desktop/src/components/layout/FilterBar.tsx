import { Search, ArrowUpDown, SortAsc, SortDesc } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDownloadStore,
  type DownloadFilter,
  type SortField,
} from "@/stores/downloads";

const FILTERS: { value: DownloadFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "queued", label: "Queued" },
  { value: "failed", label: "Failed" },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "date", label: "Date Added" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
  { value: "progress", label: "Progress" },
  { value: "status", label: "Status" },
];

export function FilterBar() {
  const { 
    filter, 
    searchQuery, 
    sortBy, 
    sortOrder, 
    setFilter, 
    setSearchQuery, 
    setSortBy, 
    setSortOrder,
  } = useDownloadStore();

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-card/50 flex-wrap">
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

      {/* Sort Options */}
      <div className="flex items-center gap-1">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value} className="text-xs">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleSortOrder}
          title={sortOrder === "asc" ? "Ascending" : "Descending"}
        >
          {sortOrder === "asc" ? (
            <SortAsc className="h-4 w-4" />
          ) : (
            <SortDesc className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-48 sm:w-64">
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
