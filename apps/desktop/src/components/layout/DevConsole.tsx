import { useState } from "react";
import { Terminal, Trash2, AlertCircle, AlertTriangle, Bug, MessageSquare, ChevronUp, ChevronDown, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

  const filteredLogs = filter === "all" 
    ? consoleLogs 
    : consoleLogs.filter(log => log.level === filter);

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
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 font-mono text-xs space-y-0.5">
          {filteredLogs.length === 0 ? (
            <div className="text-muted-foreground italic py-4 text-center">
              {filter === "all" 
                ? "No logs yet. Events will appear here."
                : `No ${filter} logs.`}
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div 
                key={log.id} 
                className={cn(
                  "flex gap-2 py-0.5 px-1 rounded hover:bg-muted/50",
                  log.level === "error" && "bg-red-500/5",
                  log.level === "warn" && "bg-yellow-500/5"
                )}
              >
                <span className="text-muted-foreground shrink-0">
                  [{log.timestamp.toLocaleTimeString()}]
                </span>
                <span
                  className={cn(
                    "shrink-0 w-14 flex items-center gap-1",
                    getLevelColor(log.level)
                  )}
                >
                  {getLevelIcon(log.level)}
                  <span className="uppercase text-[10px]">{log.level}</span>
                </span>
                <span className="break-all flex-1">{log.message}</span>
                {log.data !== undefined && (
                  <code className="text-muted-foreground text-[10px] bg-muted px-1 rounded">
                    {typeof log.data === 'object' 
                      ? JSON.stringify(log.data) 
                      : String(log.data)}
                  </code>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
