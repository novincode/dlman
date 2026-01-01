import { useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { MenuBar } from "./MenuBar";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { MainContent } from "./MainContent";
import { DevConsole } from "./DevConsole";
import { useSettingsStore } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

export function Layout() {
  const devMode = useSettingsStore((s) => s.settings.dev_mode);
  const { sidebarCollapsed, setSidebarCollapsed, showDevConsole } = useUIStore();
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Menu Bar */}
      <MenuBar />

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          {/* Sidebar */}
          <Panel
            defaultSize={20}
            minSize={15}
            maxSize={40}
            collapsible
            onCollapse={() => setSidebarCollapsed(true)}
            onExpand={() => setSidebarCollapsed(false)}
            className={cn(
              "transition-all duration-200",
              sidebarCollapsed && "hidden"
            )}
          >
            <Sidebar />
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

          {/* Main Content */}
          <Panel defaultSize={80} minSize={50}>
            <PanelGroup direction="vertical" className="h-full">
              <Panel defaultSize={devMode && showDevConsole ? 70 : 100} minSize={30}>
                <MainContent />
              </Panel>

              {/* Dev Console - resizable, collapsible */}
              {devMode && showDevConsole && (
                <>
                  <PanelResizeHandle className="h-1.5 bg-border hover:bg-primary/50 transition-colors cursor-row-resize flex items-center justify-center">
                    <div className="w-8 h-0.5 rounded-full bg-muted-foreground/30" />
                  </PanelResizeHandle>
                  <Panel 
                    defaultSize={30} 
                    minSize={consoleCollapsed ? 3 : 10} 
                    maxSize={consoleCollapsed ? 3 : 60}
                    collapsible
                  >
                    <DevConsole 
                      isCollapsed={consoleCollapsed} 
                      onToggleCollapse={() => setConsoleCollapsed(!consoleCollapsed)} 
                    />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
