"use client";

import { useEffect, useState, useCallback } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  id: string;
  className?: string;
  title?: string;
}

/**
 * CodeBlock component that reads pre-generated Shiki HTML.
 * 
 * At build time, `pnpm codegen` generates highlighted HTML for both themes.
 * This component renders the correct theme variant based on dark mode.
 * 
 * Usage:
 *   <CodeBlock id="cli-basic" title="Terminal" />
 */
export function CodeBlock({ id, className, title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [block, setBlock] = useState<{ light: string; dark: string } | null>(null);

  useEffect(() => {
    import("@/data/generated/code-blocks.json")
      .then((mod) => {
        const data = mod.default as Record<string, { light: string; dark: string }>;
        if (data[id]) setBlock(data[id]);
      })
      .catch(() => {
        // Generated file might not exist yet
      });
  }, [id]);

  const handleCopy = useCallback(() => {
    if (!block) return;
    // Extract raw text from the HTML
    const tmp = document.createElement("div");
    tmp.innerHTML = block.light;
    const text = tmp.textContent || "";
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [block]);

  if (!block) {
    return (
      <div className={cn("rounded-lg bg-muted/50 p-4 font-mono text-sm text-muted-foreground", className)}>
        Loading...
      </div>
    );
  }

  return (
    <div className={cn("group relative rounded-lg border bg-card overflow-hidden", className)}>
      {title && (
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <CopyButton copied={copied} onClick={handleCopy} />
        </div>
      )}
      {!title && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton copied={copied} onClick={handleCopy} />
        </div>
      )}
      <ScrollArea className="w-full">
        <div
          className="shiki-light block dark:hidden p-4 text-sm [&_pre]:bg-transparent [&_pre]:p-0 [&_code]:font-mono"
          dangerouslySetInnerHTML={{ __html: block.light }}
        />
        <div
          className="shiki-dark hidden dark:block p-4 text-sm [&_pre]:bg-transparent [&_pre]:p-0 [&_code]:font-mono"
          dangerouslySetInnerHTML={{ __html: block.dark }}
        />
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClick}>
      {copied ? <IconCheck className="h-3.5 w-3.5 text-primary" /> : <IconCopy className="h-3.5 w-3.5" />}
    </Button>
  );
}
