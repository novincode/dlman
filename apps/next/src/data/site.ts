/**
 * Site-wide configuration — single source of truth.
 */

export const siteConfig = {
  name: "DLMan",
  tagline: "A fast, reliable, open-source download manager.",
  description:
    "Free and open-source download manager built with Rust. Multi-segment parallel downloads, crash-safe SQLite persistence, cross-platform. The modern alternative to IDM.",
  url: "https://dlman.codeideal.com",
  github: {
    repo: "novincode/dlman",
    url: "https://github.com/novincode/dlman",
    releases: "https://github.com/novincode/dlman/releases/latest",
    issues: "https://github.com/novincode/dlman/issues",
    stars: "https://github.com/novincode/dlman/stargazers",
    sponsor: "https://github.com/sponsors/novincode",
  },
  support: {
    buymeacoffee: "https://buymeacoffee.com/codeideal",
    githubSponsor: "https://github.com/sponsors/novincode",
  },
  firefox: "https://addons.mozilla.org/en-US/firefox/addon/dlman/",
  builtBy: {
    name: "codeideal.com",
    url: "https://codeideal.com",
  },
  license: "MIT",
  currentYear: new Date().getFullYear(),
} as const;

export const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Download", href: "/download" },
  { label: "Docs", href: "/docs" },
  { label: "About", href: "/about" },
  { label: "Support", href: "/support" },
] as const;

export const footerLinks = {
  product: [
    { label: "Home", href: "/" },
    { label: "Download", href: "/download" },
    { label: "Features", href: "/#features" },
    { label: "About", href: "/about" },
  ],
  docs: [
    { label: "Introduction", href: "/docs/introduction" },
    { label: "Getting Started", href: "/docs" },
    { label: "CLI", href: "/docs/cli" },
    { label: "Browser Extension", href: "/docs/extension" },
    { label: "Core Engine", href: "/docs/core-engine" },
    { label: "Architecture", href: "/docs/architecture" },
    { label: "Contributing", href: "/docs/contributing" },
  ],
  github: [
    { label: "Repository", href: "https://github.com/novincode/dlman" },
    { label: "Releases", href: "https://github.com/novincode/dlman/releases" },
    { label: "Issues", href: "https://github.com/novincode/dlman/issues" },
    { label: "Contributing", href: "/docs/contributing" },
  ],
  community: [
    { label: "Support", href: "/support" },
    { label: "GitHub Sponsors", href: "https://github.com/sponsors/novincode" },
    { label: "Buy Me a Coffee", href: "https://buymeacoffee.com/codeideal" },
  ],
} as const;
