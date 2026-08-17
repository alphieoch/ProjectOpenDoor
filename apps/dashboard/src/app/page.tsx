import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CreditCard,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { StickyFooter } from "@/components/ui/sticky-footer";
import { getSession } from "@/lib/auth";
import MarketingHeader from "@/components/MarketingHeader";
import { HeroSection } from "@/components/ui/hero-3";
import { getDb } from "@/lib/db";
import { models, providers } from "@opendoor/database";
import { and, eq } from "drizzle-orm";
import { gatewayBaseUrl } from "@/lib/public-urls";

async function loadHeroPreview() {
  try {
    const db = getDb();
    const [providerRows, liveRows] = await Promise.all([
      db
        .select({ id: providers.id, name: providers.name })
        .from(providers)
        .where(eq(providers.enabled, true)),
      db
        .select({ providerId: models.providerId })
        .from(models)
        .where(and(eq(models.enabled, true), eq(models.deploymentStatus, "live"))),
    ]);
    const counts = new Map<string, number>();
    for (const row of liveRows) {
      if (!row.providerId) continue;
      counts.set(row.providerId, (counts.get(row.providerId) || 0) + 1);
    }
    const ranked = providerRows
      .map((p) => ({ name: p.name, liveModels: counts.get(p.id) || 0 }))
      .sort((a, b) => b.liveModels - a.liveModels);
    return {
      gatewayHost: gatewayBaseUrl().replace(/^https?:\/\//, ""),
      liveModels: liveRows.length,
      providerCount: providerRows.length,
      providers: ranked.filter((p) => p.liveModels > 0).slice(0, 3),
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  const session = await getSession();
  const signedIn = session != null;
  const preview = await loadHeroPreview();

  return (
    <main className="min-h-screen overflow-hidden bg-[#F6F5F1] text-slate-950">
      {signedIn ? (
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
        <div className="absolute left-1/2 top-[-24rem] h-[48rem] w-[48rem] -translate-x-1/2 rounded-full bg-blue-200/50 blur-3xl" />
        <div className="absolute right-[-14rem] top-40 h-[32rem] w-[32rem] rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute bottom-20 left-[-16rem] h-[34rem] w-[34rem] rounded-full bg-indigo-200/40 blur-3xl" />
      </div>

      <MarketingHeader />

      <HeroSection signedIn={signedIn} preview={preview} />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">
            Explore
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
            Each page is its own destination.
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Platform, pricing, how it works, security, and status are separate
            pages — not sections of this homepage.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {destinations.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              scroll
              className="group flex flex-col rounded-[2rem] border border-slate-200/70 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-950/5"
            >
              <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white transition group-hover:bg-blue-600">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-950">{item.title}</h3>
              <p className="mt-3 flex-1 leading-7 text-slate-600">{item.description}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
                Open {item.title.toLowerCase()} <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="rounded-[2.5rem] bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-950 p-8 text-center text-white shadow-2xl shadow-blue-950/20 lg:p-14">
          <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Ready to put a gateway in front of your AI traffic?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-blue-100">
            Create a workspace, top up $20 to get $5 of open-weight credit, and make your first
            routed model call.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href={signedIn ? "/dashboard" : "/get-started"}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 font-semibold text-blue-700 transition hover:-translate-y-0.5"
            >
              {signedIn ? "Open dashboard" : "Get started free"}{" "}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/status"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-7 py-4 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Check platform status
            </Link>
          </div>
        </div>
      </section>

      <StickyFooter />
    </main>
  );
}

const destinations = [
  {
    title: "Platform",
    href: "/platform",
    icon: Layers,
    description: "Serverless models, dedicated GPUs, fine-tunes, routers, and the control plane.",
  },
  {
    title: "Pricing",
    href: "/pricing",
    icon: CreditCard,
    description: "Live $ / 1M token rates, embeddings, and on-demand GPU SKUs from the catalog.",
  },
  {
    title: "How it works",
    href: "/how-it-works",
    icon: BookOpen,
    description: "Auth, policy, routing, and metering — plus a real curl against the gateway.",
  },
  {
    title: "Security",
    href: "/security",
    icon: ShieldCheck,
    description: "SSO, residency, audit logs, spend caps, and the in-product Trust Center.",
  },
  {
    title: "Status",
    href: "/status",
    icon: Activity,
    description: "Live probes for the gateway, database, Redis, and configured providers.",
  },
];
