import { getLatestRelease } from "@/data/downloads";
import { DownloadSection } from "@/components/download-section";
import { createOsMetadata } from "@/data/seo";
import { IconBrandWindows } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = createOsMetadata("windows");

export default async function WindowsDownloadPage() {
  const release = await getLatestRelease();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="flex flex-col items-center text-center mb-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
          <IconBrandWindows className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">DLMan for Windows</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          Available as MSI installer or setup executable
        </p>
      </div>

      <DownloadSection release={release} forOS="windows" />

      <div className="max-w-xl mx-auto mt-10">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-1">Installation note</p>
            <p className="text-xs text-muted-foreground">
              Windows SmartScreen may show a warning since the app is not code-signed.
              Click &quot;More Info&quot; → &quot;Run Anyway&quot; to proceed.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
