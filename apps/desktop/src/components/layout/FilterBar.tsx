import { Search, ArrowUpDown, SortAsc, SortDesc, Activity, ListTodo, Folder } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { useQueueStore, useQueuesArray } from "@/stores/queues";
import { useCategoryStore, useCategoriesArray } from "@/stores/categories";
import { getCategoryIcon } from "@/lib/categoryIcons";

// Status filter options with colors
const FILTERS: { value: DownloadFilter; label: string; color: string }[] = [
  { value: "all", label: "All", color: "text-foreground" },
  { value: "active", label: "Active", color: "text-blue-500" },
  { value: "completed", label: "Completed", color: "text-green-500" },
  { value: "paused", label: "Paused", color: "text-amber-500" },
  { value: "queued", label: "Queued", color: "text-slate-500" },
  { value: "failed", label: "Failed", color: "text-red-500" },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "date", label: "Date" },
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

  const queues = useQueuesArray();
  const selectedQueueId = useQueueStore((s) => s.selectedQueueId);
  const setSelectedQueue = useQueueStore((s) => s.setSelectedQueue);

  const categories = useCategoriesArray();
  const selectedCategoryId = useCategoryStore((s) => s.selectedCategoryId);
  const setSelectedCategory = useCategoryStore((s) => s.setSelectedCategory);

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  // Get current filter config
  const currentFilter = FILTERS.find(f => f.value === filter) || FILTERS[0];
  const selectedQueue = selectedQueueId ? queues.find(q => q.id === selectedQueueId) : null;
  const selectedCategory = selectedCategoryId ? categories.find(c => c.id === selectedCategoryId) : null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-card/50">
      {/* Filter Selects Group */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Status Filter */}
        <Select value={filter} onValueChange={(v) => setFilter(v as DownloadFilter)}>
          <SelectTrigger 
            className="h-7 w-auto min-w-[70px] text-xs px-2 gap-1"
            style={{ color: currentFilter.color === "text-foreground" ? undefined : currentFilter.color }}
          >
            {filter === "all" && <Activity className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map(({ value, label, color }) => (
              <SelectItem key={value} value={value} className="text-xs">
                <span className={color}>{label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Queue Filter */}
        <Select 
          value={selectedQueueId ?? "all"} 
          onValueChange={(v) => setSelectedQueue(v === "all" ? null : v)}
        >
          <SelectTrigger 
            className="h-7 w-auto min-w-[80px] text-xs px-2 gap-1"
            style={selectedQueue ? { color: selectedQueue.color } : undefined}
          >
            {!selectedQueue && <ListTodo className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Queues
            </SelectItem>
            {queues.map((queue) => (
              <SelectItem key={queue.id} value={queue.id} className="text-xs">
                <span style={{ color: queue.color }}>{queue.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category Filter */}
        <Select 
          value={selectedCategoryId ?? "all"} 
          onValueChange={(v) => setSelectedCategory(v === "all" ? null : v)}
        >
          <SelectTrigger 
            className="h-7 w-auto min-w-[80px] text-xs px-2 gap-1"
            style={selectedCategory ? { color: selectedCategory.color } : undefined}
          >
            {!selectedCategory && <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Categories
            </SelectItem>
            {categories.map((category) => {
              const iconConfig = getCategoryIcon(category.icon, category.name);
              const IconComponent = iconConfig.icon;
              return (
                <SelectItem key={category.id} value={category.id} className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <IconComponent 
                      className="h-3 w-3 flex-shrink-0" 
                      style={{ color: category.color }}
                    />
                    <span style={{ color: category.color }}>{category.name}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Sort Options */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
          <SelectTrigger className="h-7 w-auto min-w-[70px] text-xs px-2 gap-1">
            <ArrowUpDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
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
          className="h-7 w-7"
          onClick={toggleSortOrder}
          title={sortOrder === "asc" ? "Ascending" : "Descending"}
        >
          {sortOrder === "asc" ? (
            <SortAsc className="h-3.5 w-3.5" />
          ) : (
            <SortDesc className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-28 sm:w-36 flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 h-7 text-xs"
        />
      </div>
    </div>
  );
}
