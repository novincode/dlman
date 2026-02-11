import { CodeBlock } from "@/components/code-block";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createMetadata } from "@/data/seo";
import Link from "next/link";

export const metadata = createMetadata({
  title: "CLI Documentation",
  description: "DLMan CLI — full command-line reference for automation and scripting.",
  path: "/docs/cli",
});

export default function CliDocsPage() {
  return (
    <>
      <h1>CLI Reference</h1>
      <p>
        The <code>dlman</code> CLI provides full command-line access to DLMan&apos;s download engine.
        It shares the same core library (<code>dlman-core</code>) as the desktop app.
      </p>

      <h2>Installation</h2>
      <CodeBlock id="cli-install" title="Install" className="my-4" />

      <h2>Basic Usage</h2>
      <CodeBlock id="cli-basic" title="Terminal" className="my-4" />

      <h2>Advanced Usage</h2>
      <p>Queue management, batch imports, and URL probing:</p>
      <CodeBlock id="cli-advanced" title="Terminal" className="my-4" />

      <h2>Download Management</h2>
      <ul>
        <li><code>dlman add &lt;URL&gt;</code> — Add a new download</li>
        <li><code>dlman list</code> — List all downloads</li>
        <li><code>dlman info &lt;ID&gt;</code> — Show download details</li>
        <li><code>dlman pause &lt;ID&gt;</code> — Pause a download</li>
        <li><code>dlman resume &lt;ID&gt;</code> — Resume a download</li>
        <li><code>dlman cancel &lt;ID&gt;</code> — Cancel a download</li>
        <li><code>dlman delete &lt;ID&gt;</code> — Delete a download</li>
      </ul>

      <h2>Options</h2>
      <ul>
        <li><code>-o, --output &lt;PATH&gt;</code> — Save location</li>
        <li><code>-q, --queue &lt;QUEUE_ID&gt;</code> — Add to specific queue</li>
        <li><code>-s, --segments &lt;N&gt;</code> — Number of parallel segments</li>
        <li><code>-n, --now</code> — Start immediately</li>
        <li><code>--with-file</code> — Delete downloaded file when deleting</li>
      </ul>

      <h2>Queue Commands</h2>
      <ul>
        <li><code>dlman queue list</code> — List all queues</li>
        <li><code>dlman queue create &lt;NAME&gt;</code> — Create a queue</li>
        <li><code>dlman queue delete &lt;ID&gt;</code> — Delete a queue</li>
        <li><code>dlman queue start &lt;ID&gt;</code> — Start a queue</li>
        <li><code>dlman queue stop &lt;ID&gt;</code> — Stop a queue</li>
      </ul>

      <Separator className="my-6" />

      <div className="not-prose">
        <Link href="/docs/extension">
          <Card className="group hover:border-primary/30 transition-colors">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">
                Next: Browser Extension →
              </p>
              <p className="text-xs text-muted-foreground">Capture downloads from your browser</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
