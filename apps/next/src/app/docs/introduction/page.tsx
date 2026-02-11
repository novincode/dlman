import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createMetadata } from "@/data/seo";
import { features } from "@/data/features";
import Link from "next/link";
import {
  IconBolt,
  IconBrandRust,
  IconDatabase,
  IconArrowRight,
  IconCheck,
  IconX,
  IconBrandApple,
  IconBrandWindows,
  IconDeviceDesktop,
  IconBrandChrome,
  IconTerminal2,
  IconPuzzle,
  IconShieldCheck,
  IconScale,
} from "@tabler/icons-react";

export const metadata = createMetadata({
  title: "Introduction",
  description: "Why DLMan exists, what makes it different, and how it compares to alternatives like IDM.",
  path: "/docs/introduction",
});

export default function IntroductionPage() {
  return (
    <>
      <div className="not-prose mb-8">
        <Badge variant="outline" className="mb-3 gap-1.5">
          <IconBolt className="h-3 w-3" />
          Introduction
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">What is DLMan?</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          DLMan is a free, open-source download manager built from scratch in Rust. It splits
          files into parallel segments, persists progress in SQLite, and runs on every major
          platform — with a desktop app, CLI tool, and browser extension.
        </p>
      </div>

      {/* Why DLMan */}
      <h2>Why DLMan?</h2>
      <p>
        IDM costs $25+, only works on Windows, and looks like it hasn&apos;t been updated
        since 2005. Free Download Manager is bloated with ads. Most alternatives lack
        cross-platform support. DLMan solves all of that.
      </p>

      {/* Comparison table */}
      <div className="not-prose my-6">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Feature</th>
                <th className="text-center p-3 font-medium">DLMan</th>
                <th className="text-center p-3 font-medium text-muted-foreground">IDM</th>
                <th className="text-center p-3 font-medium text-muted-foreground">FDM</th>
              </tr>
            </thead>
            <tbody>
              {[
                { feature: "Free & Open Source", dlman: true, idm: false, fdm: "partial" },
                { feature: "Cross-platform", dlman: true, idm: false, fdm: true },
                { feature: "Multi-segment downloads", dlman: true, idm: true, fdm: true },
                { feature: "Crash-safe resume", dlman: true, idm: true, fdm: "partial" },
                { feature: "CLI tool", dlman: true, idm: false, fdm: false },
                { feature: "Queue scheduling", dlman: true, idm: true, fdm: true },
                { feature: "Per-download speed limits", dlman: true, idm: false, fdm: "partial" },
                { feature: "Browser extension", dlman: true, idm: true, fdm: true },
                { feature: "Modern UI", dlman: true, idm: false, fdm: "partial" },
                { feature: "MIT License", dlman: true, idm: false, fdm: false },
              ].map((row) => (
                <tr key={row.feature} className="border-b last:border-0">
                  <td className="p-3 text-xs">{row.feature}</td>
                  {[row.dlman, row.idm, row.fdm].map((val, i) => (
                    <td key={i} className="p-3 text-center">
                      {val === true ? (
                        <IconCheck className="h-4 w-4 text-primary mx-auto" />
                      ) : val === false ? (
                        <IconX className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                      ) : (
                        <span className="text-xs text-muted-foreground">~</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Core architecture */}
      <h2>Architecture at a Glance</h2>
      <p>
        DLMan is a monorepo with a shared Rust core. The same download engine powers both
        the desktop app and the CLI — feature parity is guaranteed.
      </p>

      <div className="not-prose my-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: IconBrandRust, title: "dlman-core", desc: "Rust download engine — segments, queues, rate limiting, persistence" },
            { icon: IconDatabase, title: "SQLite", desc: "Single source of truth for downloads, segments, and settings" },
            { icon: IconShieldCheck, title: "Crash-safe", desc: "Progress saved atomically after every chunk. Resume after power failures." },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="p-4">
                <item.icon className="h-5 w-5 text-primary mb-2" />
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Platform support */}
      <h2>Runs Everywhere</h2>
      <div className="not-prose my-6">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { icon: IconBrandWindows, label: "Windows" },
            { icon: IconBrandApple, label: "macOS" },
            { icon: IconDeviceDesktop, label: "Linux" },
            { icon: IconBrandChrome, label: "Chrome" },
            { icon: IconTerminal2, label: "CLI" },
            { icon: IconPuzzle, label: "Firefox" },
          ].map((p) => (
            <Card key={p.label} className="hover:border-primary/20 transition-colors">
              <CardContent className="flex flex-col items-center gap-1.5 p-4">
                <p.icon className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs font-medium">{p.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Features grid (reused from features data) */}
      <h2>Key Features</h2>
      <div className="not-prose my-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <Card key={f.title} className="hover:border-primary/20 transition-colors">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <f.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{f.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* License */}
      <h2>License</h2>
      <div className="not-prose my-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-3 p-4">
            <IconScale className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">MIT License</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use, modify, and distribute DLMan freely. No restrictions, no telemetry, no ads.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-6" />

      {/* Next steps */}
      <div className="not-prose grid gap-3 sm:grid-cols-2">
        <Link href="/docs">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">Getting Started →</p>
              <p className="text-xs text-muted-foreground">Install and start downloading</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/docs/core-engine">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">Core Engine →</p>
              <p className="text-xs text-muted-foreground">How multi-segment downloads work</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
