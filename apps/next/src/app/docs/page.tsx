import { CodeBlock } from "@/components/code-block";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createMetadata } from "@/data/seo";
import Link from "next/link";
import { IconDownload, IconArrowRight } from "@tabler/icons-react";

export const metadata = createMetadata({
  title: "Getting Started",
  description: "Install DLMan and start downloading — getting started guide.",
  path: "/docs",
});

export default function DocsGettingStarted() {
  return (
    <>
      <h1>Getting Started</h1>
      <p>
        DLMan is a free, open-source download manager built with Rust. This guide
        covers installation and basic usage.
      </p>

      <h2>Install the Desktop App</h2>
      <p>
        Download the latest release for your operating system from the{" "}
        <Link href="/download" className="text-primary hover:underline">download page</Link> or{" "}
        <Link href="https://github.com/novincode/dlman/releases/latest" target="_blank" rel="noopener" className="text-primary hover:underline">
          GitHub Releases
        </Link>.
      </p>

      <CodeBlock id="install-commands" title="Installation" className="my-4" />

      <h2>Install the Browser Extension</h2>
      <p>
        The browser extension captures downloads from Chrome, Firefox, and Edge and sends
        them to DLMan for faster downloading.
      </p>
      <ul>
        <li>
          <strong>Chrome/Edge/Brave:</strong> Download the chrome extension zip from{" "}
          <Link href="https://github.com/novincode/dlman/releases/latest" target="_blank" rel="noopener" className="text-primary hover:underline">
            releases
          </Link>, extract it, go to <code>chrome://extensions</code>, enable Developer Mode, and load unpacked.
        </li>
        <li>
          <strong>Firefox:</strong>{" "}
          <Link href="https://addons.mozilla.org/en-US/firefox/addon/dlman/" target="_blank" rel="noopener" className="text-primary hover:underline">
            Install from Firefox Add-ons
          </Link>
        </li>
      </ul>

      <h2>Install the CLI</h2>
      <p>
        The CLI shares the same core engine as the desktop app. Install it from source:
      </p>

      <CodeBlock id="cli-install" title="Terminal" className="my-4" />

      <h2>Quick Start</h2>
      <p>Start a download from the command line:</p>

      <CodeBlock id="cli-basic" title="Terminal" className="my-4" />

      <h2>Next Steps</h2>
      <div className="not-prose grid gap-3 sm:grid-cols-2 mt-4">
        <Link href="/docs/cli">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">CLI Reference →</p>
              <p className="text-xs text-muted-foreground">Commands, options, and automation</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/docs/extension">
          <Card className="group hover:border-primary/30 transition-colors h-full">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">Browser Extension →</p>
              <p className="text-xs text-muted-foreground">Capture downloads from your browser</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
