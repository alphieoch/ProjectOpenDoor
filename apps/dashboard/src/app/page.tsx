import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  Globe2,
  KeyRound,
  LockKeyhole,
  Route,
  ShieldCheck,
} from "lucide-react";
import { StickyFooter } from "@/components/ui/sticky-footer";
import { getSession } from "@/lib/auth";
import MarketingHeader from "@/components/MarketingHeader";
import { HeroSection } from "@/components/ui/hero-3";

export default async function Home() {
  const session = await getSession();
  const signedIn = session != null;

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f9ff] text-slate-950">
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

      <HeroSection signedIn={signedIn} />

      <section id="platform" className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">Platform</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            The control plane your AI stack is missing.
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            Centralize access, observability, and governance before every team
            ships their own model integration.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="group rounded-[2rem] border border-slate-200/70 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-950/5">
              <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white transition group-hover:bg-blue-600">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-950">{feature.title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="workflow" className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="overflow-hidden rounded-[2.5rem] bg-slate-950 text-white shadow-2xl shadow-slate-950/15">
          <div className="grid gap-10 p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-12">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-300">How it works</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight">
                Your apps call OpenDoor once.
              </h2>
              <p className="mt-5 leading-8 text-slate-300">
                OpenDoor handles provider routing, access control, budgets, and
                observability across every LLM vendor — your integration code
                never changes.
              </p>
              <Link
                href={signedIn ? "/dashboard/onboarding" : "/get-started"}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5"
              >
                {signedIn ? "Open dashboard" : "Get started free"}{" "}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-4">
              {workflow.map((item, index) => (
                <div key={item.title} className="flex gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-400/15 text-sm font-semibold text-blue-200">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <ShieldCheck className="h-10 w-10 text-blue-600" />
            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">
              Built for secure AI operations.
            </h2>
            <p className="mt-4 leading-8 text-slate-600">
              OpenDoor puts governance, auditability, and access control in
              front of every provider — so teams move fast without bypassing
              risk controls.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {security.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                <span className="font-medium text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="rounded-[2.5rem] bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-950 p-8 text-center text-white shadow-2xl shadow-blue-950/20 lg:p-14">
          <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Ready to put a gateway in front of your AI traffic?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-blue-100">
            Create a workspace, claim your signup credits, and make your first
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

const features = [
  {
    title: "One API, every provider",
    description: "Drop in OpenDoor's OpenAI-compatible endpoint and reach Azure, OpenAI, Anthropic, Google, Mistral, Cohere, and more — no per-provider SDK, no rewriting.",
    icon: Globe2,
  },
  {
    title: "Production routing with fallback",
    description: "Automatic failover across providers with configurable fallback chains.",
    icon: Route,
  },
  {
    title: "Central access controls",
    description: "Issue scoped keys per team with allowed models, rate limits, and spend caps enforced before every call.",
    icon: KeyRound,
  },
  {
    title: "Unified observability",
    description: "Track requests, tokens, latency, and cost per key, team, or provider from one dashboard.",
    icon: BarChart3,
  },
  {
    title: "Compliance workflows",
    description: "Approve models, enforce policies, review violations, and export immutable audit logs.",
    icon: LockKeyhole,
  },
  {
    title: "Drop-in compatible",
    description: "OpenDoor speaks OpenAI. Point your existing client at our endpoint and you're running in minutes.",
    icon: Code2,
  },
];

const workflow = [
  {
    title: "One endpoint, every model",
    description: "Point any OpenAI-compatible client at OpenDoor. No new SDK, no per-provider clients, no rewriting.",
  },
  {
    title: "Policy enforced before every call",
    description: "Access controls, rate limits, and spend budgets are checked automatically before each request is forwarded to a provider.",
  },
  {
    title: "Route, fallback, and observe",
    description: "OpenDoor selects the best provider by latency, cost, and health — with automatic fallback and full logging on every call.",
  },
];

const security = [
  "SSO and organization access controls",
  "Audit logs for every sensitive action",
  "Model approval and policy workflows",
  "Data residency and provider governance",
  "Rolling budget limits and top-ups",
  "Realtime health and usage visibility",
];
