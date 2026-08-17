import Link from "next/link";
import { ArrowRight, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroPreview = {
  gatewayHost: string;
  liveModels: number;
  providerCount: number;
  providers: Array<{ name: string; liveModels: number }>;
};

interface HeroSectionProps {
  signedIn?: boolean;
  preview?: HeroPreview | null;
}

export function HeroSection({ signedIn = false, preview = null }: HeroSectionProps) {
  return (
    <section className="relative mx-auto w-full max-w-7xl overflow-hidden px-6 pt-16 lg:px-8">
      {/* Radial glow — top-left sweep */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_10%_0%,rgba(59,130,246,0.12),transparent)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_40%_60%_at_80%_-10%,rgba(99,102,241,0.10),transparent)]" />
      </div>

      {/* ── Centered content ── */}
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">

        {/* Announcement badge */}
        <a
          href="/platform"
          className={cn(
            "group flex w-fit items-center gap-3 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-sm",
            "animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards delay-500 duration-500 ease-out"
          )}
        >
          <div className="rounded-full bg-blue-600 px-2.5 py-0.5">
            <p className="font-mono text-xs font-semibold text-white">NEW</p>
          </div>
          <span className="text-xs font-medium text-slate-600">
            Multi-provider routing with automatic fallback — now live
          </span>
          <span className="block h-4 border-l border-slate-200" />
          <div className="pr-1">
            <ArrowRight className="h-3 w-3 text-slate-400 -translate-x-0.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
          </div>
        </a>

        {/* H1 */}
        <h1
          className={cn(
            "text-balance text-5xl font-semibold leading-tight tracking-[-0.05em] text-slate-950 sm:text-6xl lg:text-7xl",
            "animate-in fade-in slide-in-from-bottom-6 fill-mode-backwards delay-100 duration-500 ease-out"
          )}
        >
          One API for every LLM provider.
        </h1>

        {/* Subhead */}
        <p
          className={cn(
            "max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl",
            "animate-in fade-in slide-in-from-bottom-6 fill-mode-backwards delay-200 duration-500 ease-out"
          )}
        >
          Route, govern, and monitor production AI traffic across Azure,
          OpenAI, Anthropic, Google, and more from a single control plane —
          without changing your app.
        </p>

        {/* CTAs */}
        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row",
            "animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards delay-300 duration-500 ease-out"
          )}
        >
          {signedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-7 py-4 text-base font-semibold text-white shadow-2xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700"
            >
              Open dashboard <ArrowRight className="h-5 w-5" />
            </Link>
          ) : (
            <>
              <Link
                href="/get-started"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-7 py-4 text-base font-semibold text-white shadow-2xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700"
              >
                Get started free <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 py-4 text-base font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
              >
                Sign in <ChevronRight className="h-5 w-5" />
              </Link>
            </>
          )}
        </div>

        {/* Stats row */}
        <div
          className={cn(
            "grid w-full max-w-lg grid-cols-3 gap-4 pt-2",
            "animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards delay-[400ms] duration-500 ease-out"
          )}
        >
          {[
            { value: preview ? String(preview.providerCount) : "—", label: "Providers" },
            { value: "0", label: "Code changes" },
            { value: preview ? String(preview.liveModels) : "—", label: "Live models" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border border-white bg-white/70 p-5 shadow-sm"
            >
              <div className="text-2xl font-semibold tracking-tight text-slate-950">
                {stat.value}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Live catalog preview ── */}
      <div
        className={cn(
          "relative mt-14 sm:mt-16 md:mt-20",
          "animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards delay-100 duration-1000 ease-out"
        )}
      >
        {/* Ellipse glow behind panel */}
        <div className="absolute -inset-x-20 -translate-y-1/3 scale-110 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.12),transparent,transparent)] blur-[50px] inset-y-0" />

        {/* Bottom fade-out mask */}
        <div
          className="relative mx-auto max-w-5xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-slate-950 p-3 shadow-2xl shadow-slate-950/20 ring-1 ring-slate-950/5"
          style={{
            maskImage: "linear-gradient(to bottom, black 60%, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent)",
          }}
        >
          <div className="rounded-[1rem] border border-white/10 bg-[#0d1224]">
            {/* Window chrome */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-amber-300" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
              </div>
              <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
                {preview?.gatewayHost || "gateway"}
              </div>
            </div>

            {/* Content */}
            <div className="grid gap-4 p-5">
              {/* Live routing */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-300">
                      Live routing
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      Production traffic
                    </h2>
                  </div>
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    {preview && preview.liveModels > 0 ? `${preview.liveModels} live` : "Catalog"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {preview?.providers.length ? (
                    preview.providers.map((row) => (
                      <div key={row.name} className="rounded-2xl bg-white/[0.06] p-4">
                        <div className="text-sm font-semibold text-white">{row.name}</div>
                        <div className="mt-3 text-2xl font-semibold text-blue-200">
                          {row.liveModels}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">live models</div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 rounded-2xl bg-white/[0.06] p-4 text-sm text-slate-300">
                      No live models in the catalog yet. Seed the database, then refresh this page.
                    </div>
                  )}
                </div>
              </div>

              {/* Policy + curl */}
              <div className="grid gap-4 sm:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                    Policy
                  </p>
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
                  <div className="text-slate-500">curl -X POST {preview?.gatewayHost || "localhost:3001"}/v1/chat/completions</div>
                  <div className="mt-3 text-blue-200">Authorization: Bearer YOUR_OPENDOOR_KEY</div>
                  <div className="text-emerald-200">model: from your catalog</div>
                  <div className="text-purple-200">OpenAI-compatible body</div>
                  <Link
                    href="/status"
                    className="mt-4 block rounded-xl bg-emerald-400/10 px-3 py-2 text-emerald-200"
                  >
                    Check live status →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
