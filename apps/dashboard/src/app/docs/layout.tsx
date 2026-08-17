import MarketingHeader from "@/components/MarketingHeader";
import { StickyFooter } from "@/components/ui/sticky-footer";
import { getSession } from "@/lib/auth";
import Link from "next/link";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <main className="relative min-h-screen bg-[#F6F5F1] text-slate-950">
      {session ? (
        <div className="relative z-20 border-b border-slate-200/90 bg-white/95 px-6 py-3 text-center text-sm text-slate-700 backdrop-blur-md">
          <span className="font-medium text-slate-900">You are signed in.</span>{" "}
          <Link
            href="/dashboard"
            className="font-semibold text-blue-700 underline-offset-2 hover:underline"
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
