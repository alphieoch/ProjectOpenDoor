import MarketingHeader from "@/components/MarketingHeader";
import { StickyFooter } from "@/components/ui/sticky-footer";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { MarketingRouteReset, MarketingSubnav } from "@/components/marketing-route-reset";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F6F5F1] text-slate-950">
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
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-24rem] h-[48rem] w-[48rem] -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute right-[-14rem] top-40 h-[32rem] w-[32rem] rounded-full bg-emerald-200/30 blur-3xl" />
        <div className="absolute bottom-20 left-[-16rem] h-[34rem] w-[34rem] rounded-full bg-sky-200/30 blur-3xl" />
      </div>
      <MarketingHeader />
      <MarketingSubnav />
      <MarketingRouteReset />
      <div className="relative z-10">{children}</div>
      <StickyFooter />
    </main>
  );
}
