import MarketingHeader from "@/components/MarketingHeader";
import { StickyFooter } from "@/components/ui/sticky-footer";
import { getSession } from "@/lib/auth";
import Link from "next/link";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      {session ? (
        <div className="relative z-20 border-b border-border bg-background/95 px-6 py-3 text-center text-sm text-muted-foreground backdrop-blur-md">
          <span className="font-medium text-foreground">You are signed in.</span>{" "}
          <Link
            href="/dashboard"
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            Open your dashboard
          </Link>
        </div>
      ) : null}
      <MarketingHeader />
      {children}
      <StickyFooter />
    </main>
  );
}
