/**
 * Docs content schema and data.
 * Each doc page is defined here with its content rendered as React components.
 */

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  order: number;
  category: string;
}

export const docPages: DocPage[] = [
  {
    slug: "introduction",
    title: "Introduction",
    description: "Why DLMan exists, what makes it different, and how it compares.",
    order: 0,
    category: "Overview",
  },
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Install DLMan and start downloading.",
    order: 1,
    category: "Overview",
  },
  {
    slug: "cli",
    title: "CLI",
    description: "Command-line interface for automation and scripting.",
    order: 2,
    category: "Tools",
  },
  {
    slug: "extension",
    title: "Browser Extension",
    description: "Capture downloads from Chrome, Firefox, and Edge.",
    order: 3,
    category: "Tools",
  },
  {
    slug: "core-engine",
    title: "Core Engine",
    description: "Multi-segment downloads, persistence, and rate limiting.",
    order: 4,
    category: "Technical",
  },
  {
    slug: "architecture",
    title: "Architecture",
    description: "System design and technical details.",
    order: 5,
    category: "Technical",
  },
  {
    slug: "contributing",
    title: "Contributing",
    description: "Setup, code style, and pull request guidelines.",
    order: 6,
    category: "Community",
  },
];

export function getDocBySlug(slug: string): DocPage | undefined {
  return docPages.find((d) => d.slug === slug);
}

export function getDocsByCategory(): Record<string, DocPage[]> {
  const grouped: Record<string, DocPage[]> = {};
  for (const doc of docPages) {
    if (!grouped[doc.category]) grouped[doc.category] = [];
    grouped[doc.category].push(doc);
  }
  return grouped;
}
