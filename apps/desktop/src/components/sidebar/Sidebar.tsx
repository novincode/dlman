import { ScrollArea } from "@/components/ui/scroll-area";
import { QueueList } from "./QueueList";
import { ActiveDownloads } from "./ActiveDownloads";
import { FolderList } from "./FolderList";
import { NetworkStats } from "./NetworkStats";

export function Sidebar() {
  return (
    <div className="flex flex-col h-full bg-card/50 border-r">
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {/* Queues Section */}
          <QueueList />

          {/* Active Downloads Section */}
          <ActiveDownloads />

          {/* Folders Section */}
          <FolderList />
        </div>
      </ScrollArea>

      <NetworkStats />
    </div>
  );
}
