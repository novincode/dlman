"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  IconBrandWindows,
  IconBrandApple,
  IconDeviceDesktop,
  IconDownload,
  IconExternalLink,
  IconBrandChrome,
  IconBrandFirefox,
  IconTerminal2,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react";
import type { ReleaseInfo } from "@/data/downloads";
import { getPlatformGroups, getExtensionDownloads, formatBytes } from "@/data/downloads";
import { siteConfig } from "@/data/site";
import { useEffect, useState, useRef, useCallback, type ComponentType } from "react";
import { cn } from "@/lib/utils";

/* ---------- OS detection ---------- */
function detectOS(): "windows" | "mac" | "linux" {
  if (typeof window === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "windows";
}

/* ---------- Tab config ---------- */
type OsId = "windows" | "mac" | "linux";

const tabs: {
  id: OsId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "windows", label: "Windows", icon: IconBrandWindows },
  { id: "mac", label: "macOS", icon: IconBrandApple },
  { id: "linux", label: "Linux", icon: IconDeviceDesktop },
];

/* ---------- Props ---------- */
interface DownloadSectionProps {
  release: ReleaseInfo | null;
  /** Lock to a single OS — hides tab switcher */
  forOS?: "windows" | "mac" | "linux";
  compact?: boolean;
}

export function DownloadSection({ release, forOS, compact = false }: DownloadSectionProps) {
  const [activeTab, setActiveTab] = useState(forOS ?? "windows");
  const [copied, setCopied] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

  /* Auto-detect OS on mount (only when not locked to a specific OS) */
  useEffect(() => {
    if (!forOS) setActiveTab(detectOS());
  }, [forOS]);

  /* Animated tab indicator */
  useEffect(() => {
    if (forOS) return;
    const container = tabsRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLButtonElement>(`[data-tab="${activeTab}"]`);
    if (!activeEl) return;
    setIndicatorStyle({
      width: activeEl.offsetWidth,
      height: activeEl.offsetHeight,
      transform: `translateX(${activeEl.offsetLeft}px)`,
    });
  }, [activeTab, forOS]);

  const groups = getPlatformGroups(release);
  const extensions = getExtensionDownloads(release);

  const activeGroup = groups.find(
    (g) => g.platform.toLowerCase().replace("macos", "mac") === activeTab
  );

  const handleCopyNote = useCallback((note: string) => {
    navigator.clipboard.writeText(note);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="w-full max-w-xl mx-auto space-y-6">
      {/* Version badge */}
      {release && (
        <div className="flex items-center justify-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            v{release.version}
          </Badge>
          <span className="text-xs text-muted-foreground">Latest Release</span>
        </div>
      )}

      {/* ──── Tab Switcher ──── */}
      {!forOS && (
        <div
          ref={tabsRef}
          className="relative mx-auto flex w-fit rounded-xl border bg-muted/40 p-1"
        >
          {/* Animated background pill */}
          <div
            className="absolute top-1 left-0 rounded-lg bg-background shadow-sm ring-1 ring-border/50 transition-all duration-300 ease-out"
            style={indicatorStyle}
          />

          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tab={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative z-10 flex flex-col items-center gap-1 rounded-lg px-5 py-2.5 text-xs font-medium transition-colors sm:flex-row sm:gap-2 sm:px-6 sm:text-sm",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/70"
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ──── Download cards for active OS ──── */}
      {activeGroup && (
        <div className="space-y-2">
          {activeGroup.downloads.map((dl, i) => (
            <Card
              key={i}
              className="group transition-colors hover:border-primary/20"
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <IconDownload className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{dl.label}</p>
                  {dl.asset && (
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {dl.asset.name} · {formatBytes(dl.asset.size)}
                    </p>
                  )}
                  {!dl.asset && (
                    <p className="text-xs text-muted-foreground">Check GitHub Releases</p>
                  )}
                </div>
                {dl.asset ? (
                  <a href={dl.asset.url} download>
                    <Button size="sm" className="gap-1.5 shrink-0">
                      <IconDownload className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Download</span>
                      <span className="sm:hidden">{dl.fileType}</span>
                    </Button>
                  </a>
                ) : (
                  <a href={siteConfig.github.releases} target="_blank" rel="noopener">
                    <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                      <IconExternalLink className="h-3.5 w-3.5" />
                      GitHub
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
          ))}

          {/* macOS unsigned-app note */}
          {activeGroup.note && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <IconTerminal2 className="h-4 w-4 shrink-0 text-primary" />
              <code className="flex-1 text-xs font-mono text-foreground">{activeGroup.note}</code>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleCopyNote(activeGroup.note!)}
                    >
                      {copied ? (
                        <IconCheck className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <IconCopy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy command</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      )}

      {/* ──── Browser Extensions ──── */}
      {!compact && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3">Browser Extension</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {extensions.map((ext, i) => {
                const Icon = ext.browser.includes("Firefox")
                  ? IconBrandFirefox
                  : IconBrandChrome;
                return (
                  <Card key={i} className="transition-colors hover:border-primary/20">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{ext.browser}</p>
                        {ext.asset && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {formatBytes(ext.asset.size)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        {ext.storeUrl && (
                          <a href={ext.storeUrl} target="_blank" rel="noopener">
                            <Button size="sm" variant="outline" className="text-xs gap-1 h-8">
                              <IconExternalLink className="h-3 w-3" />
                              Store
                            </Button>
                          </a>
                        )}
                        {ext.asset && (
                          <a href={ext.asset.url} download>
                            <Button size="sm" className="text-xs gap-1 h-8">
                              <IconDownload className="h-3 w-3" />
                              .zip
                            </Button>
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
