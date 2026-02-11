"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  IconInfoCircle,
} from "@tabler/icons-react";
import type { ReleaseInfo } from "@/data/downloads";
import { getPlatformGroups, getExtensionDownloads, formatBytes } from "@/data/downloads";
import { siteConfig } from "@/data/site";
import { useEffect, useState } from "react";

function detectOS(): "windows" | "mac" | "linux" {
  if (typeof window === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "windows";
}

const platformIcons = {
  Windows: IconBrandWindows,
  macOS: IconBrandApple,
  Linux: IconDeviceDesktop,
};

interface DownloadSectionProps {
  release: ReleaseInfo | null;
  compact?: boolean;
}

export function DownloadSection({ release, compact = false }: DownloadSectionProps) {
  const [activeTab, setActiveTab] = useState("windows");

  useEffect(() => {
    setActiveTab(detectOS());
  }, []);

  const groups = getPlatformGroups(release);
  const extensions = getExtensionDownloads(release);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {release && (
        <div className="flex items-center justify-center gap-2 mb-4">
          <Badge variant="secondary" className="font-mono text-xs">
            v{release.version}
          </Badge>
          <span className="text-sm text-muted-foreground">Latest Release</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          {groups.map((g) => {
            const Icon = platformIcons[g.platform as keyof typeof platformIcons];
            return (
              <TabsTrigger key={g.platform} value={g.platform.toLowerCase().replace("macos", "mac")} className="gap-1.5 text-xs sm:text-sm">
                {Icon && <Icon className="h-4 w-4" />}
                {g.platform}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {groups.map((g) => (
          <TabsContent key={g.platform} value={g.platform.toLowerCase().replace("macos", "mac")}>
            <Card>
              <CardContent className="p-4 space-y-3">
                {g.downloads.map((dl, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{dl.label}</p>
                      {dl.asset && (
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {dl.asset.name} · {formatBytes(dl.asset.size)}
                        </p>
                      )}
                    </div>
                    {dl.asset ? (
                      <a href={dl.asset.url} download>
                        <Button size="sm" className="gap-1.5 shrink-0">
                          <IconDownload className="h-3.5 w-3.5" />
                          {compact ? "" : "Download"}
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
                  </div>
                ))}
                {g.note && (
                  <>
                    <Separator />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-start gap-2 text-xs text-muted-foreground">
                            <IconInfoCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <code className="font-mono">{g.note}</code>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Required for unsigned macOS apps</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {!compact && (
        <>
          <Separator className="my-6" />
          <div>
            <h3 className="text-sm font-semibold mb-3">Browser Extension</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {extensions.map((ext, i) => {
                const Icon = ext.browser.includes("Firefox") ? IconBrandFirefox : IconBrandChrome;
                return (
                  <Card key={i}>
                    <CardContent className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{ext.browser}</p>
                          {ext.asset && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {formatBytes(ext.asset.size)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {ext.storeUrl && (
                          <a href={ext.storeUrl} target="_blank" rel="noopener">
                            <Button size="sm" variant="outline" className="text-xs gap-1">
                              <IconExternalLink className="h-3 w-3" />
                              Store
                            </Button>
                          </a>
                        )}
                        {ext.asset && (
                          <a href={ext.asset.url} download>
                            <Button size="sm" className="text-xs gap-1">
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
