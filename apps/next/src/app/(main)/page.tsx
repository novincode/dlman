import { HeroSection } from "@/components/sections/hero";
import { FeaturesSection } from "@/components/sections/features";
import { CliSection } from "@/components/sections/cli";
import { ExtensionSection } from "@/components/sections/extension";
import { DocsPreviewSection } from "@/components/sections/docs-preview";
import { SupportCta } from "@/components/sections/support-cta";
import { createMetadata } from "@/data/seo";

export const metadata = createMetadata();

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <CliSection />
      <ExtensionSection />
      <DocsPreviewSection />
      <SupportCta />
    </>
  );
}
