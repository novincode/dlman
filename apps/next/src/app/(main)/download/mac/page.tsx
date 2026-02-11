import { getLatestRelease } from "@/data/downloads";
import { DownloadSection } from "@/components/download-section";
import { CodeBlock } from "@/components/code-block";
import { createOsMetadata } from "@/data/seo";
import { Separator } from "@/components/ui/separator";

export const metadata = createOsMetadata("mac");

export default async function MacDownloadPage() {
  const release = await getLatestRelease();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight">DLMan for macOS</h1>
        <p className="mt-2 text-muted-foreground">
          Available for both Apple Silicon (M1/M2/M3/M4) and Intel Macs
        </p>
      </div>

      <DownloadSection release={release} />

      <Separator className="my-12" />

      <div className="max-w-2xl mx-auto space-y-6">
        <h2 className="text-xl font-bold">After Installation</h2>
        <p className="text-sm text-muted-foreground">
          Since DLMan is not signed with an Apple Developer certificate, macOS will block it.
          Run this command after installing:
        </p>
        <CodeBlock id="install-commands" title="Terminal" />
      </div>
    </div>
  );
}
