/**
 * Blog content schema.
 * Blog posts are TSX files in app/blog/[slug] with this metadata schema.
 */

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  author: string;
  tags: string[];
}

/**
 * Blog post registry — add entries here as you create posts.
 */
export const blogPosts: BlogPost[] = [
  {
    slug: "introducing-dlman",
    title: "Introducing DLMan",
    description: "Why we built a modern, open-source download manager.",
    publishedAt: "2025-01-15",
    author: "DLMan Team",
    tags: ["announcement", "open-source"],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getBlogPosts(): BlogPost[] {
  return [...blogPosts].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
