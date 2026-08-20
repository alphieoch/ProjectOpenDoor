import MarketingHeader from "@/components/MarketingHeader";
import { StickyFooter } from "@/components/ui/sticky-footer";

export function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <article className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground">Legal</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="prose prose-slate mt-10 max-w-none space-y-6 text-[15px] leading-7 text-muted-foreground">
          {children}
        </div>
      </article>
      <StickyFooter />
    </main>
  );
}
