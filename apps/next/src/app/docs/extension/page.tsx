import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { createMetadata } from "@/data/seo";
import { siteConfig } from "@/data/site";
import Link from "next/link";
import {
  IconBrandChrome,
  IconBrandFirefox,
  IconBrandEdge,
  IconArrowRight,
  IconPuzzle,
  IconWorldWww,
  IconHandClick,
  IconList,
  IconSettings,
  IconCookie,
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconCheck,
  IconPlugConnected,
  IconFileCode,
  IconCode,
  IconBrowser,
} from "@tabler/icons-react";

export const metadata = createMetadata({
  title: "Browser Extension",
  description: "DLMan browser extension — capture downloads from Chrome, Firefox, and Edge.",
  path: "/docs/extension",
});

const extensionFeatures = [
  {
    icon: IconWorldWww,
    title: "Auto-Intercept",
    desc: "Automatically intercepts browser downloads and sends them to DLMan for accelerated downloading.",
  },
  {
    icon: IconHandClick,
    title: "Context Menu",
    desc: "Right-click any link to download with DLMan. Works on files, images, and media.",
  },
  {
    icon: IconList,
    title: "Batch Downloads",
    desc: "Download all links on a page at once. Filters by file type and pattern.",
  },
  {
    icon: IconSettings,
    title: "Per-Site Settings",
    desc: "Disable DLMan on specific websites. Your rules are synced across browser sessions.",
  },
  {
    icon: IconCookie,
    title: "Cookie-Based Auth",
    desc: "Automatically passes session cookies for authenticated downloads. No manual setup needed.",
  },
  {
    icon: IconActivityHeartbeat,
    title: "Real-time Status",
    desc: "Shows connection status and active downloads in the popup. Visual feedback for every action.",
  },
];

const architectureComponents = [
  {
    icon: IconCode,
    title: "Background Script",
    file: "src/entrypoints/background.ts",
    desc: "Manages extension lifecycle, handles download interception, communicates with the desktop app, and sets up context menus.",
  },
  {
    icon: IconBrowser,
    title: "Content Script",
    file: "src/entrypoints/content.ts",
    desc: "Runs on web pages. Detects downloadable links, handles deep link opening for dialogs, and collects page information.",
  },
  {
    icon: IconPlugConnected,
    title: "Popup UI",
    file: "src/entrypoints/popup/",
    desc: "Shows extension status, displays active downloads, and allows quick configuration without leaving the page.",
  },
  {
    icon: IconFileCode,
    title: "API Client",
    file: "src/lib/api-client.ts",
    desc: "WebSocket and HTTP client for desktop app communication. Handles request/response matching and connection lifecycle.",
  },
];

export default function ExtensionDocsPage() {
  return (
    <>
      <div className="not-prose mb-8">
        <Badge variant="outline" className="mb-3 gap-1.5">
          <IconPuzzle className="h-3 w-3" />
          Browser Extension
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">Browser Extension</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Seamless integration between your web browser and DLMan desktop app.
          Capture downloads from Chrome, Firefox, and Edge.
        </p>
      </div>

      {/* Supported Browsers */}
      <div className="not-prose mb-8">
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: IconBrandChrome, name: "Chrome", note: "& Brave" },
            { icon: IconBrandFirefox, name: "Firefox", note: "Add-ons Store" },
            { icon: IconBrandEdge, name: "Edge", note: "Chromium" },
          ].map((b) => (
            <Card key={b.name} className="group hover:border-primary/20 transition-colors">
              <CardContent className="flex flex-col items-center gap-2 p-5">
                <b.icon className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-sm font-medium">{b.name}</span>
                <span className="text-[10px] text-muted-foreground">{b.note}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Features Grid */}
      <h2>Features</h2>
      <div className="not-prose my-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {extensionFeatures.map((f) => (
            <Card key={f.title} className="hover:border-primary/20 transition-colors">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <f.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Installation */}
      <h2>Installation</h2>

      <h3>Chrome / Edge / Brave</h3>
      <div className="not-prose my-4">
        <div className="space-y-2">
          {[
            { step: 1, text: <>Download the extension zip from <Link href={siteConfig.github.releases} target="_blank" rel="noopener" className="text-primary hover:underline font-medium">GitHub Releases</Link></> },
            { step: 2, text: "Extract the zip file to a folder" },
            { step: 3, text: <>Navigate to <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">chrome://extensions</code></> },
            { step: 4, text: <>Enable <strong>Developer Mode</strong> (top right toggle)</> },
            { step: 5, text: <>Click <strong>Load Unpacked</strong> and select the extracted folder</> },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {s.step}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      <h3>Firefox</h3>
      <p>
        Install directly from the{" "}
        <Link href={siteConfig.firefox} target="_blank" rel="noopener" className="text-primary hover:underline font-medium">
          Firefox Add-ons Store
        </Link>.
        No developer mode needed.
      </p>

      {/* How It Works */}
      <h2>How It Works</h2>
      <p>
        The extension communicates with the DLMan desktop app through a local HTTP/WebSocket
        server on <code>localhost:7899</code>.
      </p>

      {/* Communication flow */}
      <div className="not-prose my-6">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-muted/30 px-4 py-2 border-b">
              <span className="text-xs font-medium text-muted-foreground">Communication Flow</span>
            </div>
            <div className="p-4 space-y-3">
              {[
                { step: "1", label: "Intercept", desc: "Extension intercepts download or receives right-click action" },
                { step: "2", label: "Request", desc: "Sends request to DLMan's local server on localhost:7899" },
                { step: "3", label: "Dialog", desc: "DLMan opens the New Download dialog via deep link" },
                { step: "4", label: "Configure", desc: "You set destination, queue, and segment count" },
                { step: "5", label: "Download", desc: "Download starts with full multi-segment acceleration" },
              ].map((s, i) => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <span className="text-xs font-bold text-primary">{s.step}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                  {i < 4 && <div className="hidden sm:block w-px h-4 bg-border self-end ml-3" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* API Endpoints */}
      <h2>API Endpoints</h2>
      <div className="not-prose my-6">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-xs">Method</th>
                <th className="text-left p-3 font-medium text-xs">Path</th>
                <th className="text-left p-3 font-medium text-xs">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { method: "GET", path: "/ping", desc: "Health check" },
                { method: "GET", path: "/api/status", desc: "Get app status" },
                { method: "GET", path: "/api/queues", desc: "List download queues" },
                { method: "POST", path: "/api/downloads", desc: "Add a new download" },
                { method: "POST", path: "/api/show-dialog", desc: "Show new download dialog" },
                { method: "WS", path: "/ws", desc: "WebSocket for real-time updates" },
              ].map((r) => (
                <tr key={r.path} className="border-b last:border-0">
                  <td className="p-3">
                    <Badge variant={r.method === "POST" ? "default" : r.method === "WS" ? "outline" : "secondary"} className="text-[10px] font-mono">
                      {r.method}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono text-xs">{r.path}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Architecture Components */}
      <h2>Architecture</h2>
      <div className="not-prose my-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {architectureComponents.map((c) => (
            <Card key={c.title} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <c.icon className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">{c.title}</p>
                </div>
                <code className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                  {c.file}
                </code>
                <p className="text-xs text-muted-foreground mt-2">{c.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Configuration */}
      <h2>Configuration</h2>
      <p>Access extension settings through the popup or options page:</p>
      <div className="not-prose my-4">
        <div className="space-y-2">
          {[
            { label: "Enable/Disable", desc: "Toggle download interception globally" },
            { label: "Port", desc: "Desktop app port (default: 7899)" },
            { label: "Auto-intercept", desc: "Automatically intercept browser downloads" },
            { label: "Fallback to browser", desc: "Use browser downloads when DLMan is not running" },
            { label: "Intercept patterns", desc: "File patterns to intercept (e.g., .zip, .exe, .dmg)" },
          ].map((s) => (
            <div key={s.label} className="flex items-start gap-3 rounded-lg border p-3">
              <IconCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Troubleshooting */}
      <h2>Troubleshooting</h2>
      <div className="not-prose my-4">
        <div className="space-y-3">
          {[
            {
              title: "Extension Not Connecting",
              items: [
                "Ensure DLMan desktop app is running",
                "Check that the port matches (default: 7899)",
                "Look for error badge (\"!\") on the extension icon",
              ],
            },
            {
              title: "Downloads Not Intercepted",
              items: [
                "Verify \"Auto-intercept\" is enabled in settings",
                "Check that the file type matches intercept patterns",
                "Ensure the site is not in the disabled list",
              ],
            },
            {
              title: "Deep Links Not Working",
              items: [
                "Ensure DLMan is registered as protocol handler",
                "On macOS: Check System Settings → Default Apps",
                "Try restarting the desktop app",
              ],
            },
          ].map((section) => (
            <Card key={section.title}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <IconAlertTriangle className="h-4 w-4 text-amber-500" />
                  <p className="text-sm font-medium">{section.title}</p>
                </div>
                <ul className="space-y-1">
                  {section.items.map((item, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-muted-foreground/50 mt-0.5">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Separator className="my-6" />

      <div className="not-prose grid gap-3 sm:grid-cols-2">
        <Link href="/docs/cli">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">
                ← CLI Reference
              </p>
              <p className="text-xs text-muted-foreground">Command-line interface</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/docs/architecture">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">
                Architecture →
              </p>
              <p className="text-xs text-muted-foreground">System design and technical details</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
