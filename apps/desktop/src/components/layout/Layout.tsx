import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { MenuBar } from "./MenuBar";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { MainContent } from "./MainContent";
import { DevConsole } from "./DevConsole";
import { useSettingsStore } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

export function Layout() {
  const { devMode } = useSettingsStore();
  const { sidebarCollapsed, consoleHeight } = useUIStore();

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
            collapsed={sidebarCollapsed}
            onCollapse={() => useUIStore.getState().setSidebarCollapsed(true)}
            onExpand={() => useUIStore.getState().setSidebarCollapsed(false)}
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
              <Panel defaultSize={devMode ? 70 : 100} minSize={30}>
                <MainContent />
              </Panel>

              {/* Dev Console */}
              {devMode && (
                <>
                  <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />
                  <Panel defaultSize={30} minSize={15} maxSize={50}>
                    <DevConsole />
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
