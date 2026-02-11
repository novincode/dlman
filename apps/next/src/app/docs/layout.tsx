"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { docPages, getDocsByCategory } from "@/data/docs";
import { IconMenu2 } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const categories = getDocsByCategory();

  return (
    <nav className="space-y-4">
      {Object.entries(categories).map(([category, pages]) => (
        <div key={category}>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {category}
          </h4>
          <ul className="space-y-0.5">
            {pages.map((page) => {
              const href = page.slug === "getting-started" ? "/docs" : `/docs/${page.slug}`;
              const isActive = pathname === href;
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      "block rounded-md px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function DocsLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Navbar />
      <div className="container mx-auto max-w-6xl px-4">
        <div className="flex gap-8 py-8">
          {/* Desktop Sidebar */}
          <aside className="hidden md:block w-56 shrink-0">
            <div className="sticky top-20">
              <ScrollArea className="h-[calc(100vh-6rem)]">
                <DocsSidebar />
              </ScrollArea>
            </div>
          </aside>

          {/* Mobile Sidebar */}
          <div className="md:hidden fixed bottom-4 right-4 z-50">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button size="icon" className="rounded-full shadow-lg h-12 w-12">
                  <IconMenu2 className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Documentation Navigation</SheetTitle>
                <ScrollArea className="h-full p-6">
                  <h3 className="font-bold text-sm mb-4">Documentation</h3>
                  <DocsSidebar onNavigate={() => setOpen(false)} />
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>

          {/* Content */}
          <main className="flex-1 min-w-0">
            <article className="prose prose-sm dark:prose-invert max-w-none [&>h1]:text-2xl [&>h1]:font-bold [&>h1]:tracking-tight [&>h2]:text-xl [&>h2]:font-bold [&>h2]:mt-8 [&>h2]:mb-4 [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:mt-6 [&>h3]:mb-3 [&>p]:text-sm [&>p]:text-muted-foreground [&>p]:leading-relaxed [&>ul]:text-sm [&>ul]:text-muted-foreground [&>ol]:text-sm [&>ol]:text-muted-foreground">
              {children}
            </article>
          </main>
        </div>
      </div>
      <Footer />
    </>
  );
}
