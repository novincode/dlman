import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createMetadata } from "@/data/seo";
import Link from "next/link";

export const metadata = createMetadata({
  title: "Architecture",
  description: "DLMan system architecture — Rust core, Tauri desktop, and download engine design.",
  path: "/docs/architecture",
});

export default function ArchitectureDocsPage() {
  return (
    <>
      <h1>Architecture</h1>
      <p>
        DLMan is a monorepo with a shared Rust core library used by both the
        desktop app and CLI.
      </p>

      <h2>Project Structure</h2>
      <ul>
        <li><code>apps/desktop/</code> — Tauri + React desktop application</li>
        <li><code>apps/cli/</code> — Command-line interface</li>
        <li><code>apps/extension/</code> — Browser extension (Chrome, Firefox, Edge)</li>
        <li><code>crates/dlman-core/</code> — Core download engine (Rust)</li>
        <li><code>crates/dlman-types/</code> — Shared type definitions</li>
      </ul>

      <h2>Technology Stack</h2>

      <h3>Frontend</h3>
      <div className="not-prose">
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 my-4">
          {[
            { name: "React 18", desc: "UI Framework" },
            { name: "TypeScript", desc: "Type Safety" },
            { name: "Tailwind CSS", desc: "Styling" },
            { name: "shadcn/ui", desc: "Components" },
            { name: "Zustand", desc: "State Management" },
            { name: "Framer Motion", desc: "Animations" },
          ].map((t) => (
            <Card key={t.name}>
              <CardContent className="p-3">
                <p className="text-xs font-medium">{t.name}</p>
                <p className="text-[11px] text-muted-foreground">{t.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <h3>Backend (Rust)</h3>
      <div className="not-prose">
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 my-4">
          {[
            { name: "Tauri v2", desc: "Desktop Framework" },
            { name: "tokio", desc: "Async Runtime" },
            { name: "reqwest", desc: "HTTP Client" },
            { name: "sqlx", desc: "Database (SQLite)" },
            { name: "serde", desc: "Serialization" },
            { name: "thiserror", desc: "Error Handling" },
          ].map((t) => (
            <Card key={t.name}>
              <CardContent className="p-3">
                <p className="text-xs font-medium">{t.name}</p>
                <p className="text-[11px] text-muted-foreground">{t.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <h2>Download Engine</h2>
      <p>
        The core download engine (<code>dlman-core</code>) handles all download operations:
      </p>
      <ul>
        <li><strong>Multi-segment downloads</strong> — Splits files into configurable parallel segments</li>
        <li><strong>SQLite persistence</strong> — All progress saved atomically, crash-safe</li>
        <li><strong>Token bucket rate limiting</strong> — Smooth per-download and per-queue speed control</li>
        <li><strong>Queue scheduler</strong> — Background scheduler with time-based start/stop</li>
        <li><strong>Event system</strong> — Real-time progress, status changes via broadcast channels</li>
      </ul>

      <h2>Desktop App Architecture</h2>
      <p>
        The desktop app uses Tauri v2 as the framework. The React frontend communicates with
        the Rust backend through Tauri&apos;s IPC system (commands and events). Zustand stores
        manage frontend state and sync with the backend.
      </p>

      <h2>Browser Extension Architecture</h2>
      <p>
        The extension runs a background script that intercepts browser downloads. It
        communicates with the desktop app through a local HTTP/WebSocket server on
        port 7899. Content scripts handle deep link navigation and page-level interactions.
      </p>

      <Separator className="my-6" />

      <div className="not-prose">
        <Link href="/docs">
          <Card className="group hover:border-primary/30 transition-colors">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">
                ← Back to Getting Started
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
