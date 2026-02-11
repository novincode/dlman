import Link from "next/link";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import { siteConfig, footerLinks } from "@/data/site";

export function Footer() {
  return (
    <footer className="border-t bg-muted/20">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg mb-3">
              <Image src="/logo.png" alt="DLMan" width={24} height={24} className="rounded-md" />
              <span>{siteConfig.name}</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Free & open-source download manager built with Rust. Fast, reliable, cross-platform.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Product</h4>
            <ul className="space-y-2">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Docs */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Documentation</h4>
            <ul className="space-y-2">
              {footerLinks.docs.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* GitHub */}
          <div>
            <h4 className="font-semibold text-sm mb-3">GitHub</h4>
            <ul className="space-y-2">
              {footerLinks.github.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    target="_blank"
                    rel="noopener"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Community</h4>
            <ul className="space-y-2">
              {footerLinks.community.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel={link.href.startsWith("http") ? "noopener" : undefined}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            {siteConfig.license} License © {siteConfig.currentYear}{" "}
            <Link href={siteConfig.builtBy.url} target="_blank" rel="noopener" className="hover:text-foreground transition-colors">
              {siteConfig.builtBy.name}
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            Built with ❤️ by the DLMan community
          </p>
        </div>
      </div>
    </footer>
  );
}
