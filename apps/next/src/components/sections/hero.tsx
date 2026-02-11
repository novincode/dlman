import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconBrandGithub, IconDownload, IconArrowRight } from "@tabler/icons-react";
import { siteConfig } from "@/data/site";
import { getLatestRelease } from "@/data/downloads";
import { DownloadSection } from "@/components/download-section";
import Link from "next/link";
import Image from "next/image";

export async function HeroSection() {
  const release = await getLatestRelease();

  return (
    <section className="relative overflow-hidden">
      {/* Gradient background — controlled here, not nested in child components */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="flex flex-col items-center text-center">
          {/* Logo */}
          <div className="mb-6">
            <Image
              src="/logo.png"
              alt="DLMan"
              width={80}
              height={80}
              className="rounded-2xl shadow-lg"
              priority
            />
          </div>

          {/* Title */}
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            {siteConfig.name}
          </h1>

          <p className="mt-4 max-w-lg text-lg text-muted-foreground">
            {siteConfig.tagline}
          </p>

          <p className="mt-2 max-w-xl text-sm text-muted-foreground/80">
            Multi-segment parallel downloads · Crash-safe · Cross-platform · MIT Licensed
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/download">
              <Button size="lg" className="gap-2">
                <IconDownload className="h-4 w-4" />
                Download
               
              </Button>
            </Link>
            <Link href={siteConfig.github.url} target="_blank" rel="noopener">
              <Button size="lg" variant="outline" className="gap-2">
                <IconBrandGithub className="h-4 w-4" />
                View on GitHub
              </Button>
            </Link>
          </div>

          {/* Download tabs */}
          <div className="mt-12 w-full max-w-2xl">
            <DownloadSection release={release} compact />
          </div>
        </div>
      </div>
    </section>
  );
}
