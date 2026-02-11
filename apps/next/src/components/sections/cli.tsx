import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/code-block";
import { IconTerminal2, IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";

export function CliSection() {
  return (
    <section className="py-20 bg-muted/20">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid gap-10 lg:grid-cols-2 items-center">
          <div>
            <Badge variant="outline" className="mb-3 gap-1.5">
              <IconTerminal2 className="h-3 w-3" />
              CLI Tool
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight">
              Automate with the command line
            </h2>
            <p className="mt-3 text-muted-foreground">
              DLMan includes a full CLI that shares the same Rust core engine as the
              desktop app. Script your downloads, manage queues, and automate workflows.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/docs/cli">
                <Button variant="outline" className="gap-1.5">
                  CLI Docs
                  <IconArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
          <div>
            <CodeBlock id="cli-basic" title="Terminal" />
          </div>
        </div>
      </div>
    </section>
  );
}
