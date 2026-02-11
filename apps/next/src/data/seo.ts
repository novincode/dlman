/**
 * SEO utilities — reusable metadata generators.
 */

import type { Metadata } from "next";
import { siteConfig } from "./site";

const currentYear = new Date().getFullYear();

interface SeoOptions {
  title?: string;
  description?: string;
  path?: string;
  ogImage?: string;
}

export function createMetadata({
  title,
  description,
  path = "",
  ogImage = "/icon.png",
}: SeoOptions = {}): Metadata {
  const fullTitle = title
    ? `${title} — ${siteConfig.name}`
    : `${siteConfig.name} — Free & Open Source Download Manager ${currentYear}`;
  const desc =
    description || siteConfig.description;
  const url = `${siteConfig.url}${path}`;

  return {
    title: fullTitle,
    description: desc,
    metadataBase: new URL(siteConfig.url),
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description: desc,
      url,
      siteName: siteConfig.name,
      images: [{ url: ogImage, width: 256, height: 256 }],
      type: "website",
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description: desc,
      images: [ogImage],
    },
    keywords: [
      "download manager",
      "open source download manager",
      "free download manager",
      `IDM alternative ${currentYear}`,
      `download manager ${currentYear}`,
      "download manager for mac",
      "download manager for linux",
      "download manager for windows",
      "rust download manager",
      "multi-segment download",
      "DLMan",
    ],
    robots: { index: true, follow: true },
  };
}

/** OS-specific SEO metadata */
export function createOsMetadata(os: "mac" | "windows" | "linux"): Metadata {
  const osNames = {
    mac: "macOS",
    windows: "Windows",
    linux: "Linux",
  };
  const osName = osNames[os];
  return createMetadata({
    title: `Download DLMan for ${osName}`,
    description: `Download DLMan — the free, open-source download manager for ${osName}. Multi-segment parallel downloads, crash-safe resume, and a modern interface. The best ${osName} download manager in ${currentYear}.`,
    path: `/download/${os}`,
  });
}
