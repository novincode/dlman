import { getLatestRelease } from "@/data/downloads";
import { DownloadSection } from "@/components/download-section";
import { CodeBlock } from "@/components/code-block";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { createMetadata } from "@/data/seo";
import { IconDownload } from "@tabler/icons-react";

export const metadata = createMetadata({
  title: "Download",
  description: "Download DLMan for Windows, macOS, and Linux. Free, open-source download manager.",
  path: "/download",
});

export default async function DownloadPage() {
  const release = await getLatestRelease();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-2 mb-4">
          <IconDownload className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Download DLMan</h1>
        <p className="mt-2 text-muted-foreground">
          Available for Windows, macOS, and Linux
        </p>
      </div>

      <DownloadSection release={release} />

      <Separator className="my-12" />

      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-bold mb-4">Installation Commands</h2>
        <CodeBlock id="install-commands" title="Terminal" />
      </div>

      <Separator className="my-12" />

      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-bold mb-4">Install CLI from Source</h2>
        <CodeBlock id="cli-install" title="Terminal" />
      </div>
    </div>
  );
}
