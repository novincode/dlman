import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createMetadata } from "@/data/seo";
import { siteConfig } from "@/data/site";
import {
  IconHeart,
  IconBrandGithub,
  IconCoffee,
  IconStar,
  IconShare,
  IconGitPullRequest,
} from "@tabler/icons-react";
import Link from "next/link";

export const metadata = createMetadata({
  title: "Support",
  description: "Support DLMan — help keep this open source download manager alive.",
  path: "/support",
});

const supportOptions = [
  {
    icon: IconBrandGithub,
    title: "GitHub Sponsors",
    description: "Monthly or one-time sponsorship through GitHub.",
    href: siteConfig.support.githubSponsor,
    cta: "Sponsor on GitHub",
    external: true,
  },
  {
    icon: IconCoffee,
    title: "Buy Me a Coffee",
    description: "A quick way to show your appreciation.",
    href: siteConfig.support.buymeacoffee,
    cta: "Buy a Coffee",
    external: true,
  },
  {
    icon: IconStar,
    title: "Star the Repository",
    description: "Stars help others discover DLMan. It takes one click.",
    href: siteConfig.github.stars,
    cta: "Star on GitHub",
    external: true,
  },
  {
    icon: IconShare,
    title: "Spread the Word",
    description: "Tell a friend, share on social media, or write about DLMan.",
    href: siteConfig.github.url,
    cta: "Share",
    external: true,
  },
  {
    icon: IconGitPullRequest,
    title: "Contribute",
    description: "Fix a bug, add a feature, or improve the docs.",
    href: "https://github.com/novincode/dlman/blob/main/CONTRIBUTING.md",
    cta: "Contributing Guide",
    external: true,
  },
];

export default function SupportPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="text-center mb-12">
        <div className="flex items-center justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconHeart className="h-7 w-7" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Support DLMan</h1>
        <p className="mt-3 text-muted-foreground max-w-md mx-auto">
          DLMan is free, open source, and built by a small team. Your support
          keeps this project alive and growing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {supportOptions.map((option) => (
          <Card key={option.title} className="group hover:border-primary/30 transition-colors">
            <CardContent className="flex flex-col h-full p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3 group-hover:bg-primary/20 transition-colors">
                <option.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-sm">{option.title}</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed flex-1">
                {option.description}
              </p>
              <div className="mt-4">
                <Link
                  href={option.href}
                  target={option.external ? "_blank" : undefined}
                  rel={option.external ? "noopener" : undefined}
                >
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    {option.cta}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator className="my-12" />

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Every contribution matters. Thank you for being part of this.
        </p>
      </div>
    </div>
  );
}
