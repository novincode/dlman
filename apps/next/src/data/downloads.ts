/**
 * Download utilities — fetch latest release info from GitHub API.
 * Reusable across download page, hero section, and OS-specific pages.
 */

import { siteConfig } from "./site";

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  downloadCount: number;
}

export interface ReleaseInfo {
  version: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

export interface PlatformDownload {
  label: string;
  fileName: string;
  fileType: string;
  asset?: ReleaseAsset;
}

export interface PlatformGroup {
  platform: string;
  icon: string;
  downloads: PlatformDownload[];
  note?: string;
}

/**
 * Fetch latest release from GitHub API.
 * Uses ISR — cached and revalidated every hour.
 */
export async function getLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${siteConfig.github.repo}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    return {
      version: data.tag_name?.replace(/^v/, "") || data.name || "unknown",
      publishedAt: data.published_at,
      assets: (data.assets || []).map((a: Record<string, unknown>) => ({
        name: a.name as string,
        url: a.browser_download_url as string,
        size: a.size as number,
        downloadCount: a.download_count as number,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Match assets to platform groups for display.
 */
export function getPlatformGroups(release: ReleaseInfo | null): PlatformGroup[] {
  const findAsset = (pattern: RegExp) =>
    release?.assets.find((a) => pattern.test(a.name));

  return [
    {
      platform: "Windows",
      icon: "windows",
      downloads: [
        {
          label: "Installer (.msi)",
          fileType: ".msi",
          fileName: "DLMan_x64_en-US.msi",
          asset: findAsset(/\.msi$/i),
        },
        {
          label: "Setup (.exe)",
          fileType: ".exe",
          fileName: "DLMan_x64-setup.exe",
          asset: findAsset(/setup\.exe$/i),
        },
      ],
    },
    {
      platform: "macOS",
      icon: "apple",
      downloads: [
        {
          label: "Apple Silicon (.dmg)",
          fileType: ".dmg",
          fileName: "DLMan_aarch64.dmg",
          asset: findAsset(/aarch64\.dmg$/i),
        },
        {
          label: "Intel (.dmg)",
          fileType: ".dmg",
          fileName: "DLMan_x64.dmg",
          asset: findAsset(/amd64\.dmg|x64\.dmg/i) || findAsset(/(?<!aarch64)\.dmg$/i),
        },
      ],
      note: "Run xattr -cr /Applications/DLMan.app after install.",
    },
    {
      platform: "Linux",
      icon: "linux",
      downloads: [
        {
          label: "Debian/Ubuntu (.deb)",
          fileType: ".deb",
          fileName: "DLMan_amd64.deb",
          asset: findAsset(/\.deb$/i),
        },
        {
          label: "Fedora/RHEL (.rpm)",
          fileType: ".rpm",
          fileName: "DLMan.x86_64.rpm",
          asset: findAsset(/\.rpm$/i),
        },
        {
          label: "AppImage",
          fileType: ".AppImage",
          fileName: "DLMan_amd64.AppImage",
          asset: findAsset(/\.AppImage$/i),
        },
      ],
    },
  ];
}

export function getExtensionDownloads(release: ReleaseInfo | null) {
  const findAsset = (pattern: RegExp) =>
    release?.assets.find((a) => pattern.test(a.name));

  return [
    {
      browser: "Chrome / Edge / Brave",
      asset: findAsset(/chrome.*\.zip$/i),
      storeUrl: undefined,
    },
    {
      browser: "Firefox",
      asset: findAsset(/firefox.*\.zip$/i),
      storeUrl: siteConfig.firefox,
    },
  ];
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
