import { getLatestRelease } from "@/data/downloads";
import { DownloadSection } from "@/components/download-section";
import { CodeBlock } from "@/components/code-block";
import { Separator } from "@/components/ui/separator";
import { createOsMetadata } from "@/data/seo";

export const metadata = createOsMetadata("linux");

export default async function LinuxDownloadPage() {
  const release = await getLatestRelease();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight">DLMan for Linux</h1>
        <p className="mt-2 text-muted-foreground">
          Available as .deb, .rpm, and AppImage
        </p>
      </div>

      <DownloadSection release={release} />

      <Separator className="my-12" />

      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-bold mb-4">Install from Terminal</h2>
        <CodeBlock id="install-commands" title="Terminal" />
      </div>
    </div>
  );
}
