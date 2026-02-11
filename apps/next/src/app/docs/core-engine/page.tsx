import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createMetadata } from "@/data/seo";
import Link from "next/link";
import {
  IconBrandRust,
  IconBolt,
  IconDatabase,
  IconRefresh,
  IconClock,
  IconGauge,
  IconArrowsSplit,
  IconShieldCheck,
  IconCalendarEvent,
  IconPlayerPause,
  IconPlayerPlay,
  IconAlertTriangle,
  IconArrowRight,
} from "@tabler/icons-react";

export const metadata = createMetadata({
  title: "Core Engine",
  description: "DLMan core download engine — multi-segment downloads, SQLite persistence, and rate limiting internals.",
  path: "/docs/core-engine",
});

export default function CoreEnginePage() {
  return (
    <>
      <div className="not-prose mb-8">
        <Badge variant="outline" className="mb-3 gap-1.5">
          <IconBrandRust className="h-3 w-3" />
          Core Engine
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">Download Engine</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          The <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">dlman-core</code> crate
          is the heart of DLMan. It handles all download operations and is shared between the desktop
          app and CLI.
        </p>
      </div>

      {/* Capabilities */}
      <div className="not-prose mb-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: IconArrowsSplit, title: "Multi-Segment", desc: "Split files into up to 32 parallel segments" },
            { icon: IconDatabase, title: "SQLite Persistence", desc: "Progress saved atomically after every chunk" },
            { icon: IconGauge, title: "Rate Limiting", desc: "Token bucket algorithm for smooth throttling" },
            { icon: IconCalendarEvent, title: "Queue Scheduler", desc: "Time-based start/stop with day-of-week rules" },
            { icon: IconRefresh, title: "Auto-Retry", desc: "Exponential backoff with configurable retries" },
            { icon: IconShieldCheck, title: "Crash-Safe", desc: "Resume from exact byte position after failures" },
          ].map((f) => (
            <Card key={f.title} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-4">
                <f.icon className="h-5 w-5 text-primary mb-2" />
                <p className="text-sm font-medium">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How multi-segment downloads work */}
      <h2>Multi-Segment Downloads</h2>
      <p>
        When you download a file, DLMan splits it into multiple segments that download in
        parallel. Each segment uses its own HTTP connection with a <code>Range</code> header,
        writing directly to the correct file offset.
      </p>

      <div className="not-prose my-6">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-muted/30 px-4 py-2 border-b">
              <span className="text-xs font-medium text-muted-foreground">Download Process</span>
            </div>
            <div className="p-4 space-y-3">
              {[
                { step: "1", label: "Probe", desc: "HEAD request to get file size and check Accept-Ranges header" },
                { step: "2", label: "Plan", desc: "Calculate segment boundaries based on file size and settings" },
                { step: "3", label: "Spawn", desc: "Launch async segment worker tasks, each with its own HTTP connection" },
                { step: "4", label: "Stream", desc: "Stream data in 8KB chunks, writing to correct file offset with seek" },
                { step: "5", label: "Progress", desc: "Report progress every 100ms via broadcast channels" },
                { step: "6", label: "Complete", desc: "All segments done — verify file integrity if checksum available" },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <span className="text-xs font-bold text-primary">{s.step}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segment sizing */}
      <h2>Segment Sizing</h2>
      <p>
        Segment count is automatically calculated based on file size:
      </p>
      <div className="not-prose my-6">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-xs">File Size</th>
                <th className="text-center p-3 font-medium text-xs">Segments</th>
                <th className="text-right p-3 font-medium text-xs">Per Segment</th>
              </tr>
            </thead>
            <tbody>
              {[
                { size: "< 1 MB", segments: "1", each: "Full file" },
                { size: "1 – 10 MB", segments: "2", each: "~50%" },
                { size: "10 – 100 MB", segments: "4", each: "~25%" },
                { size: "100 MB – 1 GB", segments: "8", each: "~12.5%" },
                { size: "> 1 GB", segments: "16", each: "Variable" },
              ].map((r) => (
                <tr key={r.size} className="border-b last:border-0">
                  <td className="p-3 text-xs">{r.size}</td>
                  <td className="p-3 text-center">
                    <Badge variant="secondary" className="text-[10px] font-mono">{r.segments}</Badge>
                  </td>
                  <td className="p-3 text-right text-xs text-muted-foreground">{r.each}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pause & Resume */}
      <h2>Pause & Resume</h2>
      <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
        <Card className="hover:border-primary/20 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <IconPlayerPause className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Pausing</p>
            </div>
            <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
              <li>Cancel all segment worker tasks</li>
              <li>Save progress to SQLite immediately</li>
              <li>Record downloaded_bytes per segment</li>
            </ol>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/20 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <IconPlayerPlay className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Resuming</p>
            </div>
            <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
              <li>Load segment progress from SQLite</li>
              <li>Restart workers from last byte position</li>
              <li>Use Range: bytes=current-end header</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Speed Limiting */}
      <h2>Speed Limiting</h2>
      <p>
        DLMan uses a <strong>token bucket</strong> algorithm for smooth speed limiting.
        Tokens refill at the rate limit speed, and each segment must acquire tokens before
        downloading more data.
      </p>
      <div className="not-prose my-4">
        <div className="space-y-2">
          {[
            { level: "Per-download", desc: "Highest priority — overrides queue and global limits", priority: "1" },
            { level: "Per-queue", desc: "Applied to all downloads in the queue", priority: "2" },
            { level: "Global", desc: "App-wide limit across all downloads", priority: "3" },
          ].map((l) => (
            <div key={l.level} className="flex items-center gap-3 rounded-lg border p-3">
              <Badge variant="outline" className="text-[10px] font-mono shrink-0 w-6 justify-center">{l.priority}</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{l.level}</p>
                <p className="text-xs text-muted-foreground">{l.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Queue Scheduler */}
      <h2>Queue Scheduler</h2>
      <p>
        The <code>QueueScheduler</code> runs as a background task, checking schedules every
        30 seconds. It automatically starts and stops queues based on configured times and
        active days.
      </p>
      <div className="not-prose my-6">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-muted/30 px-4 py-2 border-b">
              <span className="text-xs font-medium text-muted-foreground">Schedule Check (every 30s)</span>
            </div>
            <div className="p-4 space-y-2">
              {[
                "For each queue with schedule.enabled = true:",
                "→ Is current day in schedule.days? If not, skip.",
                "→ Is current time ≥ start_time? Start queue.",
                "→ Is current time ≥ stop_time? Stop queue.",
                "→ Calculate countdown to next scheduled start.",
              ].map((line, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs ${i === 0 ? "font-medium" : "text-muted-foreground"} ${i > 0 ? "ml-4" : ""}`}>
                  {i === 0 ? <IconClock className="h-3.5 w-3.5 text-primary" /> : <span className="text-muted-foreground/50">·</span>}
                  {line}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retry Policy */}
      <h2>Retry Policy</h2>
      <div className="not-prose my-6">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-xs">Setting</th>
                <th className="text-right p-3 font-medium text-xs">Value</th>
              </tr>
            </thead>
            <tbody>
              {[
                { setting: "Max retries", value: "5" },
                { setting: "Initial delay", value: "1s" },
                { setting: "Backoff", value: "Exponential (1s, 2s, 4s, 8s, 16s)" },
                { setting: "Jitter", value: "±10%" },
              ].map((r) => (
                <tr key={r.setting} className="border-b last:border-0">
                  <td className="p-3 text-xs">{r.setting}</td>
                  <td className="p-3 text-right text-xs font-mono text-muted-foreground">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Handling */}
      <h2>Error Handling</h2>
      <p>
        All operations return <code>Result&lt;T, DlmanError&gt;</code>. Errors are logged
        with context, saved to the download record, surfaced to the UI, and retried when possible.
      </p>
      <div className="not-prose my-4">
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          {[
            "Network", "IO", "NotFound", "InvalidUrl", "ResumeNotSupported", "Database",
          ].map((e) => (
            <div key={e} className="flex items-center gap-2 rounded-lg border p-2.5">
              <IconAlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <code className="text-xs font-mono">{e}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Post-Download Actions */}
      <h2>Post-Download Actions</h2>
      <p>When a queue completes all downloads, these actions can trigger:</p>
      <div className="not-prose my-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { action: "Notify", desc: "Send OS notification" },
            { action: "Sleep", desc: "Put computer to sleep" },
            { action: "Shutdown", desc: "Shutdown the computer" },
            { action: "Hibernate", desc: "Hibernate the computer" },
            { action: "RunCommand", desc: "Execute a custom shell command" },
          ].map((a) => (
            <div key={a.action} className="flex items-center gap-3 rounded-lg border p-3">
              <Badge variant="secondary" className="text-[10px] font-mono shrink-0">{a.action}</Badge>
              <p className="text-xs text-muted-foreground">{a.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <Separator className="my-6" />

      <div className="not-prose grid gap-3 sm:grid-cols-2">
        <Link href="/docs/architecture">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">Architecture →</p>
              <p className="text-xs text-muted-foreground">System design overview</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/docs/contributing">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">Contributing →</p>
              <p className="text-xs text-muted-foreground">How to contribute to DLMan</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
