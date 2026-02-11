import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconArrowRight, IconBook, IconTerminal2, IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";

export function DocsPreviewSection() {
  return (
    <section className="py-20 bg-muted/20">
      <div className="container mx-auto max-w-6xl px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Documentation
        </h2>
        <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
          Everything you need to get started, configure, and automate DLMan.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
          <Link href="/docs">
            <Card className="group hover:border-primary/30 transition-colors h-full">
              <CardContent className="flex flex-col items-center gap-3 p-6">
                <IconBook className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                <h3 className="font-semibold text-sm">Getting Started</h3>
                <p className="text-xs text-muted-foreground">Installation and first steps</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/docs/cli">
            <Card className="group hover:border-primary/30 transition-colors h-full">
              <CardContent className="flex flex-col items-center gap-3 p-6">
                <IconTerminal2 className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                <h3 className="font-semibold text-sm">CLI Reference</h3>
                <p className="text-xs text-muted-foreground">Commands and automation</p>
              </CardContent>
            </Card>
          </Link>

          <Link href={`https://github.com/novincode/dlman/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener">
            <Card className="group hover:border-primary/30 transition-colors h-full">
              <CardContent className="flex flex-col items-center gap-3 p-6">
                <IconBrandGithub className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                <h3 className="font-semibold text-sm">Contributing</h3>
                <p className="text-xs text-muted-foreground">Help improve DLMan</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="mt-8">
          <Link href="/docs">
            <Button variant="outline" className="gap-1.5">
              Browse all docs
              <IconArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
