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
    slug: "getting-started",
    title: "Getting Started",
    description: "Install DLMan and start downloading.",
    order: 0,
    category: "Basics",
  },
  {
    slug: "cli",
    title: "CLI",
    description: "Command-line interface for automation and scripting.",
    order: 1,
    category: "Tools",
  },
  {
    slug: "extension",
    title: "Browser Extension",
    description: "Capture downloads from Chrome, Firefox, and Edge.",
    order: 2,
    category: "Tools",
  },
  {
    slug: "architecture",
    title: "Architecture",
    description: "System design and technical details.",
    order: 3,
    category: "Technical",
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
