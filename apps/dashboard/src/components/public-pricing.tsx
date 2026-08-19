"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag, BarChart3, Check } from "lucide-react";
import ComparisonBlock from "@/components/ui/comparison-3";

export type ChatRate = {
  modelId: string;
  provider: string;
  family: string;
  serverless: boolean;
  inputPer1MUsd: number;
  cachedInputPer1MUsd: number;
  outputPer1MUsd: number;
};

export type EmbedRate = {
  modelId: string;
  provider: string;
  serverless: boolean;
  inputPer1MUsd: number | null;
};

export type GpuRate = {
  sku: string;
  displayName: string;
  hourlyUsd: number;
  perSecondUsd: number;
  regionLockMultiplier: number;
};

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function PublicPricing({
  chat,
  embeddings,
  gpus,
  updatedAt,
}: {
  chat: ChatRate[];
  embeddings: EmbedRate[];
  gpus: GpuRate[];
  updatedAt?: string;
}) {
  const [batch, setBatch] = useState(false);
  const mul = batch ? 0.5 : 1;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8">
      <p className="od-eyebrow text-muted-foreground">[ for projects big and small ]</p>
      <h1
        className="mt-4"
        style={{
          fontFamily: "var(--font-garamond), EB Garamond, Georgia, serif",
          fontSize: "clamp(40px, 6vw, 64px)",
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
        }}
      >
        Plans and pricing
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
        No free plan. Student is $9.99. Pro is $12 — under Perplexity Pro at $20. The
        membership is the savings; included credit is a small taste, then warehouse-rate
        tokens (open-weight included) and prepaid GPUs. The first $20 top-up adds $5 of
        open-weight bonus.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Start building
        </Link>
        <Link
          href="/dashboard/models"
          className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent"
        >
          Browse models
        </Link>
      </div>

      <ComparisonBlock />

      <div className="mt-8 rounded-[1.75rem] border border-border bg-white p-6 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Add-on</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Agents</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Hosted OpenClaw, Hermes, NemoClaw, and OpenBot on your workspace. Included on
              Enterprise. Agent tokens still bill the same prepaid quota.
            </p>
          </div>
          <p className="text-4xl font-semibold tracking-tight">
            $20
            <span className="ml-1 text-sm font-normal text-muted-foreground">/month</span>
          </p>
        </div>
      </div>

      <div className="mt-16 grid gap-8 sm:grid-cols-3">
        {[
          { icon: Flag, title: "Top up to start", body: "No free credit at signup. Top up $20 or more and get $5 extra on open-weight models." },
          { icon: BarChart3, title: "Pay as you go", body: "Published $ / 1M input, cached input, and output. Batch is 50% off." },
          { icon: Check, title: "Choose your model", body: "Serverless catalog first. Dedicated L4 / A100 / H100 when you need isolation." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title}>
            <Icon className="h-5 w-5 text-foreground" />
            <h3 className="mt-3 font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <div
        className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4"
        style={{ background: "#E8EFE4" }}
      >
        <p className="text-sm text-foreground">
          Save 50% with batch processing via <code>POST /v1/batches</code>.
        </p>
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          Batch processing
          <button
            type="button"
            role="switch"
            aria-checked={batch}
            onClick={() => setBatch((v) => !v)}
            className="relative h-6 w-11 rounded-full transition-colors"
            style={{ background: batch ? "#0F172A" : "#C5C8BE" }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: batch ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </label>
      </div>

      <section className="mt-14">
        <h2 style={{ fontFamily: "var(--font-garamond), EB Garamond, Georgia, serif", fontSize: 32, letterSpacing: "-0.02em" }}>
          Serverless chat
        </h2>
        <p className="mt-2 text-muted-foreground">
          USD per 1M tokens{batch ? " · batch rates shown" : ""}. Cached input is 50% of input until prompt cache ships.
        </p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white" style={{ boxShadow: "var(--shadow-soft)" }}>
          <table className="od-price-table text-sm">
            <thead>
              <tr>
                <th>Model</th>
                <th>Input</th>
                <th>Cached input</th>
                <th>Output</th>
                <th>Tag</th>
              </tr>
            </thead>
            <tbody>
              {chat.map((r) => (
                <tr key={r.modelId}>
                  <td>
                    <div className="font-medium text-foreground">{r.modelId}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{r.provider}</div>
                  </td>
                  <td className="font-mono text-base font-semibold">{money(r.inputPer1MUsd * mul)}</td>
                  <td className="font-mono">{money(r.cachedInputPer1MUsd * mul)}</td>
                  <td className="font-mono text-base font-semibold">{money(r.outputPer1MUsd * mul)}</td>
                  <td>
                    {r.serverless ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Serverless
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">{r.family}</span>
                    )}
                  </td>
                </tr>
              ))}
              {chat.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Pricing data unavailable. Seed the database and refresh.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-right text-xs text-muted-foreground">All pricing is per million tokens.</p>
      </section>

      <section className="mt-16">
        <h2 style={{ fontFamily: "var(--font-garamond), EB Garamond, Georgia, serif", fontSize: 32, letterSpacing: "-0.02em" }}>Embeddings</h2>
        <p className="mt-2 text-muted-foreground">
          USD per 1M input tokens via <code className="text-sm">POST /v1/embeddings</code>.
        </p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white" style={{ boxShadow: "var(--shadow-soft)" }}>
          <table className="od-price-table text-sm">
            <thead>
              <tr>
                <th>Model</th>
                <th>Input / 1M</th>
                <th>Provider</th>
              </tr>
            </thead>
            <tbody>
              {embeddings.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-muted-foreground">
                    Embedding rates appear after seeding.
                  </td>
                </tr>
              ) : (
                embeddings.map((r) => (
                  <tr key={r.modelId}>
                    <td className="font-mono text-xs">{r.modelId}</td>
                    <td className="font-mono text-base font-semibold">{money(r.inputPer1MUsd == null ? null : r.inputPer1MUsd * mul)}</td>
                    <td className="text-muted-foreground">{r.provider}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-16">
        <h2 style={{ fontFamily: "var(--font-garamond), EB Garamond, Georgia, serif", fontSize: 32, letterSpacing: "-0.02em" }}>On-demand GPUs</h2>
        <p className="mt-2 text-muted-foreground">
          Dedicated capacity. This Mac (Metal) is $0. GCP is list price — about 25% over Google’s all-in cost — billed per second while warm. Scale-to-zero is $0 idle.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {gpus.map((g) => (
            <div key={g.sku} className="rounded-2xl border border-border bg-white p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
              <div className="text-sm text-muted-foreground">{g.sku}</div>
              <div className="mt-1" style={{ fontFamily: "var(--font-garamond), EB Garamond, Georgia, serif", fontSize: 26 }}>{g.displayName}</div>
              <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Hourly</span>
                <span className="font-mono font-semibold">{money(g.hourlyUsd)}/hr</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Per second</span>
                <span className="font-mono text-xs">${g.perSecondUsd.toFixed(6)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ul className="mt-10 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Cached input is billed at 50% of input until prompt-cache affinity ships.</li>
        <li>Serverless models need no GPU deploy step (wholesale warm path).</li>
        <li>On-demand GPUs map to dedicated capacity, not serverless.</li>
      </ul>
      {updatedAt && (
        <p className="mt-6 text-xs text-slate-400">Rates as of {updatedAt} · source: pricing_rules</p>
      )}
    </div>
  );
}
