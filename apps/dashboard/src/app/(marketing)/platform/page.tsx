import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Code2,
  Cpu,
  FlaskConical,
  Globe2,
  KeyRound,
  LockKeyhole,
  Route,
  Server,
} from "lucide-react";
import { MarketingCtaBanner, MarketingHero } from "@/components/marketing-page-shell";
import { cn } from "@/lib/utils";
import { getDb } from "@/lib/db";
import { models, providers } from "@opendoor/database";
import { and, eq } from "drizzle-orm";
import { docsHref, gatewayBaseUrl } from "@/lib/public-urls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Platform — OpenDoor",
  description:
    "Serverless open-weight inference, dedicated GPUs, training, and a governed OpenAI-compatible control plane.",
};

const pillars = [
  {
    title: "Serverless open models",
    description:
      "Call Llama, Qwen, DeepSeek, and more with published $ / 1M rates — no Request GPU step. Wholesale warm path when Together is configured.",
    icon: Globe2,
    href: "/pricing",
    link: "See rates",
  },
  {
    title: "Dedicated deployments",
    description:
      "Run on this Mac (Ollama / Metal) or GCP Cloud Run GPU. Custom weights, precision, autoscaling, scale-to-zero, and reserved capacity.",
    icon: Server,
    href: "/dashboard/deployments",
    link: "Open deployments",
  },
  {
    title: "Multi-LoRA & routers",
    description:
      "Load adapters on vLLM endpoints and split traffic with A/B routers (router:slug) across healthy deployments.",
    icon: Route,
    href: "/dashboard/deployments/routers",
    link: "Open routers",
  },
  {
    title: "Fine-tunes at base price",
    description:
      "Upload datasets, run SFT / DPO / ORPO jobs, and serve ft: models billed at the base model list price.",
    icon: FlaskConical,
    href: "/dashboard/training",
    link: "Open training",
  },
  {
    title: "Governed access",
    description:
      "Scoped API keys, spend caps, service_tier priority, and org policies enforced before every provider call.",
    icon: KeyRound,
    href: "/security",
    link: "Security overview",
  },
  {
    title: "Observability & billing",
    description:
      "Tokens, latency, cached rates, GPU-seconds, and usage explorer in one dashboard — Stripe top-ups included.",
    icon: BarChart3,
    href: "/dashboard/usage",
    link: "Open usage",
  },
];

const surfaces = [
  {
    title: "OpenAI-compatible API",
    body: "Chat, completions, embeddings, rerank, vision, structured outputs, and batches on /v1.",
    icon: Code2,
    href: docsHref("/api-reference/chat-completions"),
  },
  {
    title: "GPU SKUs",
    body: "Standard, Fast, and Ultra GPUs available — on-demand, with per-second metering for dedicated fleets.",
    icon: Cpu,
    href: "/pricing",
  },
  {
    title: "Trust center",
    body: "Model approvals, policies, violations, sector packs, and immutable audit logs.",
    icon: LockKeyhole,
    href: "/security",
  },
];

async function loadPlatformStats() {
  try {
    const db = getDb();
    const [providerRows, liveRows] = await Promise.all([
      db
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.enabled, true)),
      db
        .select({ id: models.id })
        .from(models)
        .where(and(eq(models.enabled, true), eq(models.deploymentStatus, "live"))),
    ]);
    return {
      providers: providerRows.length,
      liveModels: liveRows.length,
      host: gatewayBaseUrl().replace(/^https?:\/\//, ""),
    };
  } catch {
    return {
      providers: 0,
      liveModels: 0,
      host: gatewayBaseUrl().replace(/^https?:\/\//, ""),
    };
  }
}

export default async function PlatformPage() {
  const stats = await loadPlatformStats();

  return (
    <article id="platform-page">
      <MarketingHero
        eyebrow="Platform"
        title="The control plane for open-weight AI."
        description="One endpoint for serverless models, dedicated GPUs, fine-tunes, and governance — so product teams ship without each building their own provider stack."
        actions={
          <>
            <Link
              href="/get-started"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              View pricing
            </Link>
          </>
        }
        aside={
          <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-border">
            {[
              { label: "Live models", value: stats.liveModels || "—" },
              { label: "Providers", value: stats.providers || "—" },
              { label: "Gateway", value: stats.host, mono: true },
            ].map((item) => (
              <div key={item.label} className="lg:py-5 first:lg:pt-0 last:lg:pb-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {item.label}
                </p>
                <p
                  className={`mt-1 font-semibold text-foreground ${item.mono ? "truncate font-mono text-sm" : "text-3xl"}`}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        }
      />

      <section className="mx-auto max-w-7xl px-6 pb-8 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          What you can build
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Build anything on OpenDoor.
        </h2>
        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3">
          {pillars.map((item) => (
            <div
              key={item.title}
              className={cn(
                "flex flex-col border-border py-8",
                "max-md:border-t max-md:first:border-t-0",
                "md:border-r md:px-8 md:[&:nth-child(2n)]:border-r-0 md:[&:nth-child(n+3)]:border-t",
                "lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-child(n+3)]:border-t-0 lg:[&:nth-child(n+4)]:border-t",
              )}
            >
              <item.icon className="h-5 w-5 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">{item.title}</h3>
              <p className="mt-3 flex-1 leading-7 text-muted-foreground">{item.description}</p>
              <Link
                href={item.href}
                className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              >
                {item.link} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="border-b border-border px-8 py-8 lg:px-12">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">What you get day one</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Fireworks-style commercial surface plus OpenDoor governance. Worldwide residency —
              process your data where you want, and we can support it.
            </p>
          </div>
          <div className="grid gap-0 md:grid-cols-3">
            {surfaces.map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className="border-t border-border p-8 transition hover:bg-slate-50 md:border-t-0 md:border-l md:first:border-l-0"
              >
                <s.icon className="h-6 w-6 text-muted-foreground" />
                <h3 className="mt-4 font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <MarketingCtaBanner
        title="Create a free workspace"
        description="Top up $20, get $5 of open-weight credit, and call a live model from the playground."
        href="/get-started"
        label="Sign up"
      />
    </article>
  );
}
