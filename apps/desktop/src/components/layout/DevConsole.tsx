import { Terminal, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

export function DevConsole() {
  const { consoleLogs, clearConsoleLogs } = useUIStore();

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

  return (
    <div className="flex flex-col h-full bg-card border-t">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span>Dev Console</span>
          <span className="text-xs">({consoleLogs.length} logs)</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={clearConsoleLogs}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Logs */}
      <ScrollArea className="flex-1">
        <div className="p-2 font-mono text-xs space-y-0.5">
          {consoleLogs.length === 0 ? (
            <div className="text-muted-foreground italic">
              No logs yet. Events will appear here.
            </div>
          ) : (
            consoleLogs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">
                  [{log.timestamp.toLocaleTimeString()}]
                </span>
                <span
                  className={cn(
                    "uppercase shrink-0 w-12",
                    getLevelColor(log.level)
                  )}
                >
                  {log.level}
                </span>
                <span className="break-all">{log.message}</span>
                {log.data && (
                  <span className="text-muted-foreground">
                    {JSON.stringify(log.data)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
