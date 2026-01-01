import { useMemo, useState } from "react";
import { Terminal, Trash2, AlertCircle, AlertTriangle, Bug, MessageSquare, ChevronUp, ChevronDown, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useUIStore } from "@/stores/ui";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";

type LogLevel = "info" | "warn" | "error" | "debug" | "all";

interface DevConsoleProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function DevConsole({ isCollapsed = false, onToggleCollapse }: DevConsoleProps) {
  const { consoleLogs, clearConsoleLogs } = useUIStore();
  const { setDevMode } = useSettingsStore();
  const [filter, setFilter] = useState<LogLevel>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // Close console by disabling dev mode in settings
  const handleClose = () => {
    setDevMode(false);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-500";
      case "warn":
        return "text-yellow-500";
      case "debug":
        return "text-blue-500";
      default:
        return "text-foreground";
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error":
        return <AlertCircle className="h-3 w-3" />;
      case "warn":
        return <AlertTriangle className="h-3 w-3" />;
      case "debug":
        return <Bug className="h-3 w-3" />;
      default:
        return <MessageSquare className="h-3 w-3" />;
    }
  };

  const filteredLogs = useMemo(() => {
    return filter === "all" ? consoleLogs : consoleLogs.filter((log) => log.level === filter);
  }, [consoleLogs, filter]);

  const filteredIndexById = useMemo(() => {
    const map = new Map<string, number>();
    filteredLogs.forEach((l, idx) => map.set(l.id, idx));
    return map;
  }, [filteredLogs]);

  const normalizeSelectionToFiltered = (next: Set<string>) => {
    // Drop selections that aren't currently visible (due to filter).
    const pruned = new Set<string>();
    for (const id of next) {
      if (filteredIndexById.has(id)) pruned.add(id);
    }
    return pruned;
  };

  const selectSingle = (id: string) => {
    setSelectedIds(new Set([id]));
    setAnchorId(id);
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return normalizeSelectionToFiltered(next);
    });
    setAnchorId(id);
  };

  const selectRange = (toId: string) => {
    const anchor = anchorId && filteredIndexById.has(anchorId) ? anchorId : toId;
    const a = filteredIndexById.get(anchor);
    const b = filteredIndexById.get(toId);
    if (a === undefined || b === undefined) {
      selectSingle(toId);
      return;
    }
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const next = new Set<string>();
    for (let i = start; i <= end; i++) next.add(filteredLogs[i].id);
    setSelectedIds(next);
    setAnchorId(anchor);
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const getLogLine = (log: (typeof consoleLogs)[number]) => {
    const t = log.timestamp.toLocaleTimeString();
    const base = `[${t}] ${log.level.toUpperCase()} ${log.message}`;
    if (log.data === undefined) return base;
    const dataStr = typeof log.data === "object" ? JSON.stringify(log.data) : String(log.data);
    return `${base} ${dataStr}`;
  };

  const copySelected = async (fallbackLog?: (typeof consoleLogs)[number]) => {
    const ids = selectedIds.size > 0 ? selectedIds : fallbackLog ? new Set([fallbackLog.id]) : new Set<string>();
    if (ids.size === 0) return;
    const lines = filteredLogs.filter((l) => ids.has(l.id)).map(getLogLine);
    await copyText(lines.join("\n"));
  };

  const copyAll = async () => {
    const lines = filteredLogs.map(getLogLine);
    await copyText(lines.join("\n"));
  };

  const errorCount = consoleLogs.filter(l => l.level === "error").length;
  const warnCount = consoleLogs.filter(l => l.level === "warn").length;

  // Collapsed view - just show a thin bar with expand button
  if (isCollapsed) {
    return (
      <div className="flex items-center justify-between px-3 py-1 bg-card border-t gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal className="h-3 w-3" />
          <span>Console</span>
          {errorCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 font-medium">
              {errorCount}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 font-medium">
              {warnCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={onToggleCollapse}
            title="Expand console"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={handleClose}
            title="Disable Dev Mode"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-t">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b gap-2 shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span>Dev Console</span>
          {errorCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 font-medium">
              {errorCount} error{errorCount > 1 ? "s" : ""}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 font-medium">
              {warnCount} warning{warnCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Filter Toggle */}
        <ToggleGroup 
          type="single" 
          value={filter} 
          onValueChange={(v) => v && setFilter(v as LogLevel)}
          className="gap-0.5"
        >
          <ToggleGroupItem value="all" size="sm" className="text-xs h-6 px-2">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="error" size="sm" className="text-xs h-6 px-2 data-[state=on]:text-red-500">
            <AlertCircle className="h-3 w-3 mr-1" />
            Errors
          </ToggleGroupItem>
          <ToggleGroupItem value="warn" size="sm" className="text-xs h-6 px-2 data-[state=on]:text-yellow-500">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warns
          </ToggleGroupItem>
          <ToggleGroupItem value="debug" size="sm" className="text-xs h-6 px-2 data-[state=on]:text-blue-500">
            <Bug className="h-3 w-3 mr-1" />
            Debug
          </ToggleGroupItem>
          <ToggleGroupItem value="info" size="sm" className="text-xs h-6 px-2">
            <MessageSquare className="h-3 w-3 mr-1" />
            Info
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={clearConsoleLogs}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onToggleCollapse}
            title="Collapse console"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleClose}
            title="Disable Dev Mode"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Logs */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
            e.preventDefault();
            // Select all visible logs
            const allIds = new Set(filteredLogs.map(l => l.id));
            setSelectedIds(allIds);
            if (filteredLogs.length > 0) {
              setAnchorId(filteredLogs[0].id);
            }
          }
        }}
      >
      <ScrollArea 
        className="h-full"
      >
        <div className="p-2 font-mono text-xs space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-muted-foreground italic py-4 text-center">
              {filter === "all" 
                ? "No logs yet. Events will appear here."
                : `No ${filter} logs.`}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isSelected = selectedIds.has(log.id);

              return (
                <ContextMenu key={log.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={cn(
                        "py-1 px-2 rounded hover:bg-muted/50 cursor-default transition-colors",
                        log.level === "error" && "bg-red-500/5",
                        log.level === "warn" && "bg-yellow-500/5",
                        isSelected && "bg-muted"
                      )}
                      onClick={(e) => {
                        const isRange = e.shiftKey;
                        const isToggle = e.metaKey || e.ctrlKey;

                        if (isRange) {
                          selectRange(log.id);
                          return;
                        }
                        if (isToggle) {
                          toggleOne(log.id);
                          return;
                        }
                        selectSingle(log.id);
                      }}
                      onContextMenu={() => {
                        // Right-clicking a row should at least focus it.
                        if (!selectedIds.has(log.id)) {
                          selectSingle(log.id);
                        }
                      }}
                    >
                      {/* First line: time + level */}
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-muted-foreground shrink-0 text-[11px]">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 flex items-center gap-1",
                            getLevelColor(log.level)
                          )}
                        >
                          {getLevelIcon(log.level)}
                          <span className="uppercase text-[9px] font-semibold">{log.level}</span>
                        </span>
                      </div>
                      
                      {/* Second line: message + data */}
                      <div className="ml-2 space-y-0.5">
                        <div className="break-all select-text leading-relaxed">
                          {log.message}
                        </div>
                        {log.data !== undefined && (
                          <div className="text-muted-foreground text-[10px] bg-muted/60 px-1.5 py-1 rounded max-w-full overflow-x-auto select-text leading-relaxed">
                            {typeof log.data === "object" ? JSON.stringify(log.data, null, 2) : String(log.data)}
                          </div>
                        )}
                      </div>
                    </div>
                  </ContextMenuTrigger>

                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={async () => {
                        await copyText(getLogLine(log));
                      }}
                    >
                      Copy message
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={async () => {
                        await copySelected(log);
                      }}
                    >
                      Copy selected
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={async () => {
                        await copyAll();
                      }}
                    >
                      Copy all messages
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })
          )}
        </div>
      </ScrollArea>
      </div>
    </div>
  );
}
