import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconHeart, IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";

export function SupportCta() {
  return (
    <section className="py-20">
      <div className="container mx-auto max-w-6xl px-4">
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="flex flex-col items-center text-center p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
              <IconHeart className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              Keep DLMan alive
            </h2>
            <p className="mt-3 text-muted-foreground max-w-md">
              DLMan is free and open source. Your support — whether a star, a contribution,
              or a small donation — helps keep this project going.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/support">
                <Button className="gap-1.5">
                  <IconHeart className="h-3.5 w-3.5" />
                  Support the project
                </Button>
              </Link>
              <Link href="https://github.com/novincode/dlman" target="_blank" rel="noopener">
                <Button variant="outline" className="gap-1.5">
                  Star on GitHub
                  <IconArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
