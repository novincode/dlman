import { getLatestRelease } from "@/data/downloads";
import { DownloadSection } from "@/components/download-section";
import { CodeBlock } from "@/components/code-block";
import { Separator } from "@/components/ui/separator";
import { createOsMetadata } from "@/data/seo";
import { IconDeviceDesktop } from "@tabler/icons-react";

export const metadata = createOsMetadata("linux");

export default async function LinuxDownloadPage() {
  const release = await getLatestRelease();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="flex flex-col items-center text-center mb-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
          <IconDeviceDesktop className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">DLMan for Linux</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          Available as .deb, .rpm, and AppImage
        </p>
      </div>

      <DownloadSection release={release} forOS="linux" />

      <Separator className="my-10" />

      <div className="max-w-xl mx-auto">
        <h2 className="text-lg font-bold mb-4 text-center">Install from Terminal</h2>
        <CodeBlock id="install-commands" title="Terminal" />
      </div>
    </div>
  );
}
