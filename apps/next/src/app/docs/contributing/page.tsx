import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CodeBlock } from "@/components/code-block";
import { createMetadata } from "@/data/seo";
import { siteConfig } from "@/data/site";
import Link from "next/link";
import {
  IconGitBranch,
  IconGitPullRequest,
  IconBug,
  IconBulb,
  IconCode,
  IconTerminal2,
  IconBrandRust,
  IconBrandReact,
  IconFolders,
  IconCheck,
  IconHeart,
  IconArrowRight,
} from "@tabler/icons-react";

export const metadata = createMetadata({
  title: "Contributing",
  description: "How to contribute to DLMan — setup, code style, and pull request guidelines.",
  path: "/docs/contributing",
});

export default function ContributingPage() {
  return (
    <>
      <div className="not-prose mb-8">
        <Badge variant="outline" className="mb-3 gap-1.5">
          <IconHeart className="h-3 w-3" />
          Contributing
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">Contributing to DLMan</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          We welcome contributions of all kinds — bug fixes, features, docs, and ideas.
          Here&apos;s how to get started.
        </p>
      </div>

      {/* Prerequisites */}
      <h2>Prerequisites</h2>
      <div className="not-prose my-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { icon: IconCode, name: "Node.js", version: "v20+" },
            { icon: IconBrandRust, name: "Rust", version: "1.75+" },
            { icon: IconFolders, name: "pnpm", version: "v9+" },
          ].map((p) => (
            <Card key={p.name}>
              <CardContent className="flex items-center gap-3 p-4">
                <p.icon className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.version}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Start */}
      <h2>Quick Start</h2>
      <CodeBlock id="cli-install" title="Setup" className="my-4" />

      {/* Project Structure */}
      <h2>Project Structure</h2>
      <div className="not-prose my-4">
        <div className="space-y-2">
          {[
            { path: "apps/desktop/", desc: "Tauri + React desktop application", icon: IconBrandReact },
            { path: "apps/cli/", desc: "CLI application (Rust)", icon: IconTerminal2 },
            { path: "apps/extension/", desc: "Browser extension (WXT)", icon: IconCode },
            { path: "crates/dlman-core/", desc: "Core download engine (Rust)", icon: IconBrandRust },
            { path: "crates/dlman-types/", desc: "Shared type definitions", icon: IconFolders },
          ].map((item) => (
            <div key={item.path} className="flex items-start gap-3 rounded-lg border p-3">
              <item.icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <code className="text-xs font-mono font-medium">{item.path}</code>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Development commands */}
      <h2>Development</h2>

      <h3>Desktop App</h3>
      <div className="not-prose my-4 space-y-2">
        {[
          { cmd: "pnpm tauri dev", desc: "Development mode with hot reload" },
          { cmd: "pnpm tauri build", desc: "Build for production" },
        ].map((c) => (
          <div key={c.cmd} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <code className="text-xs font-mono">{c.cmd}</code>
            <span className="text-xs text-muted-foreground shrink-0">{c.desc}</span>
          </div>
        ))}
      </div>

      <h3>CLI</h3>
      <div className="not-prose my-4 space-y-2">
        {[
          { cmd: "cargo run -p dlman-cli -- --help", desc: "Run CLI in dev" },
          { cmd: "cargo build -p dlman-cli --release", desc: "Build release binary" },
        ].map((c) => (
          <div key={c.cmd} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <code className="text-xs font-mono">{c.cmd}</code>
            <span className="text-xs text-muted-foreground shrink-0">{c.desc}</span>
          </div>
        ))}
      </div>

      <h3>Browser Extension</h3>
      <div className="not-prose my-4 space-y-2">
        {[
          { cmd: "pnpm --filter @dlman/extension dev", desc: "Chrome dev mode" },
          { cmd: "pnpm --filter @dlman/extension dev:firefox", desc: "Firefox dev mode" },
          { cmd: "pnpm --filter @dlman/extension build:chrome", desc: "Build for Chrome" },
        ].map((c) => (
          <div key={c.cmd} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <code className="text-xs font-mono">{c.cmd}</code>
            <span className="text-xs text-muted-foreground shrink-0">{c.desc}</span>
          </div>
        ))}
      </div>

      {/* Code Style */}
      <h2>Code Style</h2>
      <div className="not-prose my-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconBrandReact className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">TypeScript / React</p>
              </div>
              <ul className="space-y-1.5">
                {[
                  "Strict mode enabled, avoid any types",
                  "One component per file",
                  "Functional components with hooks",
                  "Prefer named exports",
                ].map((r) => (
                  <li key={r} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <IconCheck className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconBrandRust className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Rust</p>
              </div>
              <ul className="space-y-1.5">
                {[
                  "Follow standard clippy lints",
                  "Keep functions focused and small",
                  "Document public APIs",
                  "Files under 300 lines when possible",
                ].map((r) => (
                  <li key={r} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <IconCheck className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Workflow */}
      <h2>Submitting Changes</h2>

      <h3>Bug Fixes</h3>
      <div className="not-prose my-4 space-y-2">
        {[
          { step: 1, text: "Check if an issue already exists", icon: IconBug },
          { step: 2, text: "Fork the repo and create a branch: fix/issue-description", icon: IconGitBranch },
          { step: 3, text: "Make your changes and test thoroughly", icon: IconCode },
          { step: 4, text: "Submit a pull request", icon: IconGitPullRequest },
        ].map((s) => (
          <div key={s.step} className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <s.icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{s.text}</p>
          </div>
        ))}
      </div>

      <h3>New Features</h3>
      <div className="not-prose my-4 space-y-2">
        {[
          { step: 1, text: "Open an issue to discuss the feature first", icon: IconBulb },
          { step: 2, text: "Wait for feedback from maintainers", icon: IconCheck },
          { step: 3, text: "Fork and create a branch: feature/feature-name", icon: IconGitBranch },
          { step: 4, text: "Implement, test, and submit a PR", icon: IconGitPullRequest },
        ].map((s) => (
          <div key={s.step} className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <s.icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{s.text}</p>
          </div>
        ))}
      </div>

      {/* PR Guidelines */}
      <h2>Pull Request Guidelines</h2>
      <div className="not-prose my-4">
        <div className="space-y-2">
          {[
            "Keep PRs focused on a single change",
            "Update documentation if needed",
            "Ensure all tests pass",
            "Follow the existing code style",
            "Write a clear PR description",
          ].map((g) => (
            <div key={g} className="flex items-start gap-3 rounded-lg border p-3">
              <IconCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">{g}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Testing */}
      <h2>Testing</h2>
      <div className="not-prose my-4 space-y-2">
        {[
          { cmd: "cargo test", desc: "Run Rust tests" },
          { cmd: "cd apps/desktop && pnpm tsc --noEmit", desc: "Type check frontend" },
        ].map((c) => (
          <div key={c.cmd} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <code className="text-xs font-mono">{c.cmd}</code>
            <span className="text-xs text-muted-foreground shrink-0">{c.desc}</span>
          </div>
        ))}
      </div>

      <Separator className="my-6" />

      {/* Links */}
      <div className="not-prose grid gap-3 sm:grid-cols-2">
        <Link href={siteConfig.github.issues} target="_blank" rel="noopener">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="flex items-center gap-3 p-4">
              <IconBug className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <div>
                <p className="text-sm font-medium group-hover:text-primary transition-colors">Report a Bug</p>
                <p className="text-xs text-muted-foreground">Open a GitHub issue</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href={siteConfig.github.url} target="_blank" rel="noopener">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="flex items-center gap-3 p-4">
              <IconGitBranch className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <div>
                <p className="text-sm font-medium group-hover:text-primary transition-colors">Fork on GitHub</p>
                <p className="text-xs text-muted-foreground">Start contributing</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
