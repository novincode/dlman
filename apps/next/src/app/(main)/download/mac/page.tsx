import { getLatestRelease } from "@/data/downloads";
import { DownloadSection } from "@/components/download-section";
import { createOsMetadata } from "@/data/seo";
import { IconBrandApple, IconTerminal2, IconShieldCheck } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = createOsMetadata("mac");

export default async function MacDownloadPage() {
  const release = await getLatestRelease();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="flex flex-col items-center text-center mb-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
          <IconBrandApple className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">DLMan for macOS</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          Available for Apple Silicon (M1/M2/M3/M4) and Intel Macs
        </p>
      </div>

      <DownloadSection release={release} forOS="mac" />

      <div className="max-w-xl mx-auto mt-10 space-y-4">
        <h2 className="text-lg font-bold text-center">After Installation</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <IconTerminal2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Remove quarantine</p>
                <p className="text-xs text-muted-foreground mt-1">
                  DLMan is not signed with Apple Developer certificate. Run the xattr command shown above to allow it.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <IconShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Gatekeeper bypass</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Or go to System Settings → Privacy & Security and click &quot;Open Anyway&quot;.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
