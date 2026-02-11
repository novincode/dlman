"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { siteConfig, navLinks } from "@/data/site";
import { IconMenu2, IconBrandGithub, IconDownload } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Image src="/logo.png" alt="DLMan" width={28} height={28} className="rounded-md" />
          <span>{siteConfig.name}</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "text-sm",
                  pathname === link.href && "bg-accent text-accent-foreground"
                )}
              >
                {link.label}
              </Button>
            </Link>
          ))}
        </nav>

        {/* Desktop Right */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <Link href={siteConfig.github.url} target="_blank" rel="noopener">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <IconBrandGithub className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/download">
            <Button size="sm" className="gap-1.5">
              <IconDownload className="h-3.5 w-3.5" />
              Download
            </Button>
          </Link>
        </div>

        {/* Mobile Menu */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <IconMenu2 className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <ScrollArea className="h-full">
                <div className="flex flex-col p-6">
                  <Link href="/" className="flex items-center gap-2 font-bold text-lg mb-6" onClick={() => setOpen(false)}>
                    <Image src="/logo.png" alt="DLMan" width={24} height={24} className="rounded-md" />
                    <span>{siteConfig.name}</span>
                  </Link>

                  <nav className="flex flex-col gap-1">
                    {navLinks.map((link) => (
                      <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start",
                            pathname === link.href && "bg-accent text-accent-foreground"
                          )}
                        >
                          {link.label}
                        </Button>
                      </Link>
                    ))}
                  </nav>

                  <Separator className="my-4" />

                  <div className="flex flex-col gap-2">
                    <Link href={siteConfig.github.url} target="_blank" rel="noopener" onClick={() => setOpen(false)}>
                      <Button variant="outline" className="w-full gap-2">
                        <IconBrandGithub className="h-4 w-4" />
                        GitHub
                      </Button>
                    </Link>
                    <Link href="/download" onClick={() => setOpen(false)}>
                      <Button className="w-full gap-2">
                        <IconDownload className="h-4 w-4" />
                        Download
                      </Button>
                    </Link>
                  </div>
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
