import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/data/seo";
import { siteConfig } from "@/data/site";
import Link from "next/link";
import Image from "next/image";
import {
  IconBrandGithub,
  IconBrandRust,
  IconCode,
  IconLicense,
  IconArrowRight,
} from "@tabler/icons-react";

export const metadata = createMetadata({
  title: "About",
  description: "About DLMan — a free, open-source download manager built with Rust.",
  path: "/about",
});

const techStack = [
  { name: "Rust", description: "Core engine & CLI" },
  { name: "Tauri v2", description: "Desktop framework" },
  { name: "React 18", description: "Desktop & web UI" },
  { name: "TypeScript", description: "Frontend type safety" },
  { name: "SQLite", description: "Download persistence" },
  { name: "Tailwind CSS", description: "Styling" },
];

export default function AboutPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      {/* Header */}
      <div className="text-center mb-12">
        <Image
          src="/logo.png"
          alt="DLMan"
          width={64}
          height={64}
          className="mx-auto rounded-xl shadow-md mb-4"
        />
        <h1 className="text-3xl font-bold tracking-tight">About DLMan</h1>
        <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
          {siteConfig.description}
        </p>
      </div>

      {/* Why */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-4">Why DLMan?</h2>
        <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            Traditional download managers are either expensive, Windows-only, or look like
            they were built in 2005. DLMan is a modern alternative — free, open source, and
            available on every platform.
          </p>
          <p>
            Built with Rust for native performance, DLMan splits files into parallel segments,
            persists everything to SQLite for crash safety, and wraps it all in a clean UI
            powered by Tauri and React.
          </p>
        </div>
      </section>

      <Separator className="my-8" />

      {/* Tech Stack */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-4">Tech Stack</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {techStack.map((tech) => (
            <Card key={tech.name}>
              <CardContent className="p-4">
                <p className="text-sm font-medium">{tech.name}</p>
                <p className="text-xs text-muted-foreground">{tech.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="my-8" />

      {/* Links */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-4">Links</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href={siteConfig.github.url} target="_blank" rel="noopener">
            <Card className="group hover:border-primary/30 transition-colors h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <IconBrandGithub className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <div>
                  <p className="text-sm font-medium">GitHub Repository</p>
                  <p className="text-xs text-muted-foreground">Source code, issues, releases</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs">
            <Card className="group hover:border-primary/30 transition-colors h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <IconCode className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <div>
                  <p className="text-sm font-medium">Documentation</p>
                  <p className="text-xs text-muted-foreground">Guides, CLI, architecture</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* License */}
      <Card className="bg-muted/30">
        <CardContent className="flex items-center gap-3 p-4">
          <IconLicense className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">MIT License</p>
            <p className="text-xs text-muted-foreground">
              Free to use, modify, and distribute. Built with ❤️ by{" "}
              <Link href={siteConfig.builtBy.url} target="_blank" rel="noopener" className="text-primary hover:underline">
                {siteConfig.builtBy.name}
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
