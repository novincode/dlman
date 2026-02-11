import { Card, CardContent } from "@/components/ui/card";
import { features } from "@/data/features";

export function FeaturesSection() {
  return (
    <section id="features" className="py-20">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">
            Everything you need in a download manager
          </h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            Built with Rust for speed and reliability. No Electron bloat, no subscriptions.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="group hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm">{feature.title}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
