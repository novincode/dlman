import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/data/seo";
import { getBlogPost } from "@/data/blog";
import { siteConfig } from "@/data/site";
import { notFound } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";

export const metadata = createMetadata({
  title: "Introducing DLMan",
  description: "Why we built a modern, open-source download manager.",
  path: "/blog/introducing-dlman",
});

export default function IntroducingDlman() {
  const post = getBlogPost("introducing-dlman");
  if (!post) notFound();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <Link href="/blog">
        <Button variant="ghost" size="sm" className="gap-1.5 mb-6 -ml-2 text-muted-foreground">
          <IconArrowLeft className="h-3.5 w-3.5" />
          Back to blog
        </Button>
      </Link>

      <article>
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{post.author}</span>
            <span>·</span>
            <span>
              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:text-sm [&>p]:text-muted-foreground [&>p]:leading-relaxed [&>h2]:text-xl [&>h2]:font-bold [&>h2]:mt-8 [&>h2]:mb-4">
          <p>
            Download managers have been around for decades. IDM is the name most people know —
            but it costs $25+, only works on Windows, and its interface hasn&apos;t changed since
            the early 2000s. We wanted something better.
          </p>

          <h2>Built with Rust</h2>
          <p>
            DLMan&apos;s core download engine is written in Rust. This gives us native performance
            without the overhead of Electron or similar frameworks. The Tauri v2 framework keeps
            the desktop app lightweight — the entire binary is under 10 MB.
          </p>

          <h2>Crash-Safe by Design</h2>
          <p>
            Every download&apos;s progress is persisted to SQLite atomically. If DLMan crashes, if your
            computer loses power, if the network drops — your downloads resume from the exact byte
            position. No corrupted files, no starting over.
          </p>

          <h2>Try It</h2>
          <p>
            DLMan is available for Windows, macOS, and Linux. Download it from the{" "}
            <Link href="/download" className="text-primary hover:underline">downloads page</Link>,
            or install the CLI from source:
          </p>

          <CodeBlock id="cli-install" title="Terminal" className="my-4" />

          <p>
            We&apos;re just getting started. Star the{" "}
            <Link href={siteConfig.github.url} target="_blank" rel="noopener" className="text-primary hover:underline">
              GitHub repo
            </Link>{" "}
            and join us.
          </p>
        </div>
      </article>
    </div>
  );
}
