import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  IconBrandChrome,
  IconBrandFirefox,
  IconBrandEdge,
  IconArrowRight,
  IconPuzzle,
} from "@tabler/icons-react";
import Link from "next/link";
import { siteConfig } from "@/data/site";

const browsers = [
  { name: "Chrome", icon: IconBrandChrome },
  { name: "Firefox", icon: IconBrandFirefox },
  { name: "Edge", icon: IconBrandEdge },
];

export function ExtensionSection() {
  return (
    <section className="py-20">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid gap-10 lg:grid-cols-2 items-center">
          <div className="order-2 lg:order-1">
            <div className="grid grid-cols-3 gap-4">
              {browsers.map((b) => (
                <Card key={b.name} className="group hover:border-primary/30 transition-colors">
                  <CardContent className="flex flex-col items-center gap-2 p-6">
                    <b.icon className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium">{b.name}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-4 text-center">
              <Link href={siteConfig.firefox} target="_blank" rel="noopener">
                <Button variant="link" size="sm" className="text-xs text-muted-foreground gap-1">
                  Firefox Add-on Store
                  <IconArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <Badge variant="outline" className="mb-3 gap-1.5">
              <IconPuzzle className="h-3 w-3" />
              Browser Extension
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight">
              Capture downloads from your browser
            </h2>
            <p className="mt-3 text-muted-foreground">
              Automatically intercept downloads, right-click context menu, batch download all
              links on a page, and per-site configuration. Available for all major browsers.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/docs/extension">
                <Button variant="outline" className="gap-1.5">
                  Extension Docs
                  <IconArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
              <Link href="/download">
                <Button variant="ghost" className="gap-1.5">
                  Download
                  <IconArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
