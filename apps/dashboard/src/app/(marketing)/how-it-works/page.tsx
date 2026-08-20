import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, KeyRound, Rocket, Server, Terminal } from "lucide-react";
import { MarketingCtaBanner, MarketingHero } from "@/components/marketing-page-shell";
import { CopyButton } from "@/components/ui/copy-button";
import { getDb } from "@/lib/db";
import { models } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { docsHref, gatewayBaseUrl } from "@/lib/public-urls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How it works — OpenDoor",
  description:
    "Point any OpenAI-compatible client at OpenDoor. We enforce policy, route providers, and bill transparently.",
};

const steps = [
  {
    title: "Create a workspace & API key",
    description:
      "Sign up, top up $20 to unlock $5 of open-weight credit, and mint a key with model allowlists, RPM/TPM, and spend caps.",
  },
  {
    title: "Policy runs before the provider",
    description:
      "Auth, rate limits, spend-tier TPM unlocks, service_tier (standard / priority), and org governance all gate the request.",
  },
  {
    title: "Route, cache affinity, observe",
    description:
      "Smart routing picks a healthy provider. Prompt-cache affinity sticks successful paths. Tokens and cost land in usage + billing.",
  },
  {
    title: "Scale beyond chat",
    description:
      "Need a GPU? Deploy dedicated. Need a fine-tune? Train → call ft: at base price. Need A/B? Use router:slug.",
  },
];

const path = [
  { n: "01", title: "Auth", body: "Bearer key is hashed and loaded. Disabled or over-cap keys never leave the gateway." },
  { n: "02", title: "Policy", body: "Allowlists, RPM/TPM, spend tiers, and org policies decide if the call proceeds." },
  { n: "03", title: "Route", body: "A healthy provider (or dedicated deployment / router) is chosen. Fallbacks fire on failure." },
  { n: "04", title: "Meter", body: "Tokens, latency, and cost are written. Cached input is billed at the published rate." },
];

const next = [
  {
    title: "Playground",
    body: "Pick a live catalog model and send a real chat completion.",
    href: "/dashboard/playground",
    icon: Rocket,
  },
  {
    title: "API keys",
    body: "Mint a scoped key, then drop it into any OpenAI SDK.",
    href: "/dashboard/api-keys",
    icon: KeyRound,
  },
  {
    title: "Deployments",
    body: "Stand up dedicated GPUs or local Ollama when serverless is not enough.",
    href: "/dashboard/deployments",
    icon: Server,
  },
  {
    title: "Docs",
    body: "Chat, embeddings, batches, vision, and service tiers — on this site.",
    href: docsHref("/"),
    icon: BookOpen,
  },
  {
    title: "SDK & CLI",
    body: "One key for the terminal and TypeScript client, including OpenBot.",
    href: "/sdk",
    icon: Terminal,
  },
];

async function firstModelId() {
  try {
    const db = getDb();
    const row = await db
      .select({ modelId: models.modelId })
      .from(models)
      .where(eq(models.enabled, true))
      .limit(1);
    return row[0]?.modelId || "llama-3.1-8b-instruct";
  } catch {
    return "llama-3.1-8b-instruct";
  }
}

export default async function HowItWorksPage() {
  const host = gatewayBaseUrl().replace(/^https?:\/\//, "");
  const modelId = await firstModelId();
  const example = `curl -X POST https://${host}/v1/chat/completions \\
  -H "Authorization: Bearer $OPENDOOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [{"role":"user","content":"Hello"}]
  }'`;

  return (
    <article id="how-it-works-page">
      <MarketingHero
        eyebrow="How it works"
        title="Your apps call OpenDoor once."
        description="Keep your OpenAI SDK. Change the base URL. OpenDoor handles access, routing, fallbacks, and metering across serverless and dedicated paths."
        actions={
          <>
            <Link
              href="/get-started"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Get started free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={docsHref("/")}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-slate-50"
            >
              Read the docs
            </Link>
          </>
        }
      />

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
        <div className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-2xl shadow-slate-950/15">
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="space-y-8 p-8 lg:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
                Designed for developers
              </p>
              {steps.map((step, i) => (
                <div key={step.title} className="flex gap-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-400/15 text-sm font-semibold text-blue-200">
                    {i + 1}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">{step.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 bg-black/30 p-8 lg:border-l lg:border-t-0 lg:p-12">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
                  Example
                </p>
                <CopyButton
                  value={example}
                  label="Copy"
                  className="!border-white/15 !bg-white/10 !text-white"
                />
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80 p-5 text-xs leading-6 text-emerald-200">
                <code>{example}</code>
              </pre>
              <p className="mt-4 text-sm text-slate-400">
                Same shape as OpenAI. Point clients at{" "}
                <span className="text-slate-200">{host}</span>. Model id comes from the live
                catalog.
              </p>
              <Link
                href="/dashboard/playground"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white underline-offset-4 hover:underline"
              >
                Try the playground <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          A request, end to end
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Four gates. Then the provider.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {path.map((item) => (
            <div
              key={item.n}
              className="rounded-2xl border border-border bg-white p-6 shadow-sm"
            >
              <p className="font-mono text-xs font-semibold text-muted-foreground">{item.n}</p>
              <h3 className="mt-3 text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-8 lg:px-8">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
          Then use it in the product
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {next.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex gap-4 rounded-2xl border border-border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <MarketingCtaBanner
        title="Ready to send the first request?"
        description="Create a workspace, mint a key, and keep your existing OpenAI client."
        href="/get-started"
        label="Get started free"
      />
    </article>
  );
}
