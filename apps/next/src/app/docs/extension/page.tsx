import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/data/seo";
import { siteConfig } from "@/data/site";
import Link from "next/link";
import {
  IconBrandChrome,
  IconBrandFirefox,
  IconBrandEdge,
  IconArrowRight,
} from "@tabler/icons-react";

export const metadata = createMetadata({
  title: "Browser Extension",
  description: "DLMan browser extension — capture downloads from Chrome, Firefox, and Edge.",
  path: "/docs/extension",
});

export default function ExtensionDocsPage() {
  return (
    <>
      <h1>Browser Extension</h1>
      <p>
        The DLMan browser extension provides seamless integration between your web browser
        and the DLMan desktop application.
      </p>

      <h2>Features</h2>
      <ul>
        <li><strong>Automatic Download Interception</strong> — Intercepts browser downloads and sends them to DLMan</li>
        <li><strong>Context Menu</strong> — Right-click any link to download with DLMan</li>
        <li><strong>Batch Downloads</strong> — Download all links on a page at once</li>
        <li><strong>Per-Site Settings</strong> — Disable DLMan on specific websites</li>
        <li><strong>Cookie-Based Auth</strong> — Automatically passes session cookies for authenticated downloads</li>
        <li><strong>Real-time Status</strong> — Shows connection status and active downloads in popup</li>
      </ul>

      <h2>Installation</h2>

      <h3>Chrome / Edge / Brave</h3>
      <ol>
        <li>Download the extension zip from <Link href={siteConfig.github.releases} target="_blank" rel="noopener" className="text-primary hover:underline">GitHub Releases</Link></li>
        <li>Extract the zip file</li>
        <li>Open <code>chrome://extensions</code></li>
        <li>Enable <strong>Developer Mode</strong></li>
        <li>Click <strong>Load Unpacked</strong> and select the extracted folder</li>
      </ol>

      <h3>Firefox</h3>
      <p>
        Install directly from the{" "}
        <Link href={siteConfig.firefox} target="_blank" rel="noopener" className="text-primary hover:underline">
          Firefox Add-ons Store
        </Link>.
      </p>

      <h2>How It Works</h2>
      <p>
        The extension communicates with the DLMan desktop app through a local HTTP/WebSocket
        server on <code>localhost:7899</code>. When you start a download in the browser,
        the extension sends the URL to DLMan, which opens its download dialog with all the
        configuration options.
      </p>

      <h3>Communication Flow</h3>
      <ol>
        <li>Extension intercepts download or receives right-click action</li>
        <li>Sends request to DLMan&apos;s local server</li>
        <li>DLMan opens the New Download dialog</li>
        <li>You configure destination, queue, and segments</li>
        <li>Download starts with full multi-segment acceleration</li>
      </ol>

      <Separator className="my-6" />

      <div className="not-prose">
        <Link href="/docs/architecture">
          <Card className="group hover:border-primary/30 transition-colors">
            <CardContent className="p-4">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">
                Next: Architecture →
              </p>
              <p className="text-xs text-muted-foreground">System design and technical details</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
