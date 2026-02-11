import { getLatestRelease } from "@/data/downloads";
import { DownloadSection } from "@/components/download-section";
import { createOsMetadata } from "@/data/seo";

export const metadata = createOsMetadata("windows");

export default async function WindowsDownloadPage() {
  const release = await getLatestRelease();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight">DLMan for Windows</h1>
        <p className="mt-2 text-muted-foreground">
          Available as MSI installer or setup executable
        </p>
      </div>

      <DownloadSection release={release} />
    </div>
  );
}
