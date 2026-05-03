import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Code2,
  DoorOpen,
  Globe2,
  KeyRound,
  LockKeyhole,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f9ff] text-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-24rem] h-[48rem] w-[48rem] -translate-x-1/2 rounded-full bg-blue-200/50 blur-3xl" />
        <div className="absolute right-[-14rem] top-40 h-[32rem] w-[32rem] rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute bottom-20 left-[-16rem] h-[34rem] w-[34rem] rounded-full bg-indigo-200/40 blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-white/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-blue-900/10">
              <DoorOpen className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">OpenDoor</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#platform" className="transition hover:text-slate-950">
              Platform
            </a>
            <a href="#workflow" className="transition hover:text-slate-950">
              Workflow
            </a>
            <a href="#security" className="transition hover:text-slate-950">
              Security
            </a>
            <Link href="/status" className="transition hover:text-slate-950">
              Status
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-xl shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 px-6 pb-24 pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-32 lg:pt-24">
        <div>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm">
            <Sparkles className="h-4 w-4" />
            Multi-region AI gateway for production teams
          </div>

          <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-6xl lg:text-7xl">
            Launch AI products with one secure gateway.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
            Route every model request through OpenDoor for policy controls,
            spend visibility, failover, and audit logs without changing your
            app architecture.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-7 py-4 text-base font-semibold text-white shadow-2xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700"
            >
              Create your workspace <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 py-4 text-base font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              View demo dashboard <ChevronRight className="h-5 w-5" />
            </Link>
          </div>

          <div className="mt-12 grid max-w-2xl grid-cols-3 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-3xl border border-white bg-white/70 p-5 shadow-sm">
                <div className="text-2xl font-semibold tracking-tight text-slate-950">{stat.value}</div>
                <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-emerald-400/20 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-slate-950 p-3 shadow-2xl shadow-slate-950/20">
            <div className="rounded-[1.5rem] border border-white/10 bg-[#0d1224]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-300" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
                  gateway.opendoor.ai
                </div>
              </div>

              <div className="grid gap-4 p-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-300">Live routing</p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">Production traffic</h2>
                    </div>
                    <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                      Healthy
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      ["OpenAI", "42ms", "48%"],
                      ["Anthropic", "58ms", "31%"],
                      ["Gemini", "64ms", "21%"],
                    ].map(([name, latency, share]) => (
                      <div key={name} className="rounded-2xl bg-white/[0.06] p-4">
                        <div className="text-sm font-semibold text-white">{name}</div>
                        <div className="mt-3 text-2xl font-semibold text-blue-200">{latency}</div>
                        <div className="mt-1 text-xs text-slate-400">{share} share</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[0.95fr_1.05fr]">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Policy</p>
                    <div className="mt-4 space-y-3">
                      {["PII redaction", "EU residency", "Budget cap"].map((item) => (
                        <div key={item} className="flex items-center gap-2 text-sm text-slate-200">
                          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 font-mono text-xs text-slate-300">
                    <div className="text-slate-500">curl -X POST /v1/chat/completions</div>
                    <div className="mt-3 text-blue-200">model: route:auto</div>
                    <div className="text-emerald-200">policy: production-safe</div>
                    <div className="text-purple-200">fallback: enabled</div>
                    <div className="mt-4 rounded-xl bg-emerald-400/10 px-3 py-2 text-emerald-200">
                      200 OK - 46ms - $0.0021
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-300">Onboarding</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight">
                From signup to first API call in minutes.
              </h2>
              <p className="mt-5 leading-8 text-slate-300">
                New workspaces now land in a guided setup flow with the exact
                steps needed to create keys, configure routing, and invite the
                team.
              </p>
              <Link
                href="/signup"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5"
              >
                Start onboarding <ArrowRight className="h-4 w-4" />
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
              OpenDoor brings governance, auditability, and access control to
              every provider so teams can move quickly without bypassing risk
              controls.
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
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 font-semibold text-blue-700 transition hover:-translate-y-0.5"
            >
              Get started free <ArrowRight className="h-5 w-5" />
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

      <footer className="relative z-10 border-t border-slate-200/80 bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <DoorOpen className="h-5 w-5 text-slate-900" />
            <span className="font-semibold text-slate-900">OpenDoor</span>
            <span>Multi-region LLM gateway</span>
          </div>
          <div className="flex gap-5">
            <Link href="/status" className="hover:text-slate-950">
              Status
            </Link>
            <Link href="/login" className="hover:text-slate-950">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-slate-950">
              Start free
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

const stats = [
  { value: "1 API", label: "All models" },
  { value: "4h", label: "Budget windows" },
  { value: "99.99%", label: "SLA ready" },
];

const features = [
  {
    title: "Smart model routing",
    description: "Route by latency, provider health, cost, region, or custom policy with fallback built in.",
    icon: Route,
  },
  {
    title: "Per-key controls",
    description: "Issue scoped API keys with allowed models, rate limits, and spend controls for each team.",
    icon: KeyRound,
  },
  {
    title: "Usage intelligence",
    description: "Track requests, tokens, latency, and cost across providers from a single dashboard.",
    icon: BarChart3,
  },
  {
    title: "Compliance workflows",
    description: "Approve models, enforce policies, review violations, and export immutable audit logs.",
    icon: LockKeyhole,
  },
  {
    title: "Multi-provider mesh",
    description: "Connect OpenAI, Anthropic, Google, Mistral, Cohere, DeepSeek, Qwen, and more.",
    icon: Globe2,
  },
  {
    title: "Developer friendly",
    description: "Use OpenAI-compatible endpoints so teams can migrate without rewriting their apps.",
    icon: Code2,
  },
];

const workflow = [
  {
    title: "Create a workspace",
    description: "Sign up with email, name your organization, and receive starter credits automatically.",
  },
  {
    title: "Generate your first key",
    description: "Choose unrestricted or model-specific access and copy the key once for secure storage.",
  },
  {
    title: "Route production traffic",
    description: "Point your existing client at OpenDoor and monitor requests, latency, and spend.",
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
