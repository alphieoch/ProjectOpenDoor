"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag, BarChart3, Check } from "lucide-react";
import { PricingPlans } from "@/components/pricing-plans";

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
      <p className="od-eyebrow" style={{ color: "#1A73E8" }}>[ for projects big and small ]</p>
      <h1
        className="mt-4"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "clamp(40px, 6vw, 64px)",
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
        }}
      >
        Plans and pricing
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
        No free plan. Pro is $12 — forty percent under Perplexity Pro. Usage is
        pay-as-you-go. The first $20 top-up adds $5 of open-weight credit; closed
        models and cloud GPUs stay prepaid.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-blue-600"
        >
          Start building
        </Link>
        <Link
          href="/dashboard/models"
          className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5"
        >
          Browse models
        </Link>
      </div>

      <PricingPlans />

      <div className="mt-8 rounded-[1.75rem] border border-slate-200 bg-white p-6 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Add-on</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Agents</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Hosted OpenClaw, Hermes, and NemoClaw on your workspace. Included on
              Enterprise. Agent tokens still bill the same prepaid quota.
            </p>
          </div>
          <p className="text-4xl font-semibold tracking-tight">
            $20
            <span className="ml-1 text-sm font-normal text-slate-500">/month</span>
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
            <Icon className="h-5 w-5 text-slate-950" />
            <h3 className="mt-3 font-semibold text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
          </div>
        ))}
      </div>

      <div
        className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4"
        style={{ background: "#E8EFE4" }}
      >
        <p className="text-sm text-slate-800">
          Save 50% with batch processing via <code>POST /v1/batches</code>.
        </p>
        <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
          Batch processing
          <button
            type="button"
            role="switch"
            aria-checked={batch}
            onClick={() => setBatch((v) => !v)}
            className="relative h-6 w-11 rounded-full transition-colors"
            style={{ background: batch ? "#1A73E8" : "#C5C8BE" }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: batch ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </label>
      </div>

      <section className="mt-14">
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 32, letterSpacing: "-0.02em" }}>
          Serverless chat
        </h2>
        <p className="mt-2 text-slate-600">
          USD per 1M tokens{batch ? " · batch rates shown" : ""}. Cached input is 50% of input until prompt cache ships.
        </p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white" style={{ boxShadow: "var(--shadow-soft)" }}>
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
                    <div className="font-medium text-slate-950">{r.modelId}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{r.provider}</div>
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
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Pricing data unavailable. Seed the database and refresh.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-right text-xs text-slate-500">All pricing is per million tokens.</p>
      </section>

      <section className="mt-16">
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 32, letterSpacing: "-0.02em" }}>Embeddings</h2>
        <p className="mt-2 text-slate-600">
          USD per 1M input tokens via <code className="text-sm">POST /v1/embeddings</code>.
        </p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white" style={{ boxShadow: "var(--shadow-soft)" }}>
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
                  <td colSpan={3} className="px-4 py-6 text-slate-500">
                    Embedding rates appear after seeding.
                  </td>
                </tr>
              ) : (
                embeddings.map((r) => (
                  <tr key={r.modelId}>
                    <td className="font-mono text-xs">{r.modelId}</td>
                    <td className="font-mono text-base font-semibold">{money(r.inputPer1MUsd == null ? null : r.inputPer1MUsd * mul)}</td>
                    <td className="text-slate-600">{r.provider}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-16">
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 32, letterSpacing: "-0.02em" }}>On-demand GPUs</h2>
        <p className="mt-2 text-slate-600">
          Dedicated capacity. This Mac (Metal) is $0. GCP is list price — about 25% over Google’s all-in cost — billed per second while warm. Scale-to-zero is $0 idle.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {gpus.map((g) => (
            <div key={g.sku} className="rounded-2xl border border-slate-200 bg-white p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
              <div className="text-sm text-slate-500">{g.sku}</div>
              <div className="mt-1" style={{ fontFamily: "var(--font-serif)", fontSize: 26 }}>{g.displayName}</div>
              <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3">
                <span className="text-sm text-slate-500">Hourly</span>
                <span className="font-mono font-semibold">{money(g.hourlyUsd)}/hr</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-sm text-slate-500">Per second</span>
                <span className="font-mono text-xs">${g.perSecondUsd.toFixed(6)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ul className="mt-10 list-disc space-y-2 pl-5 text-sm text-slate-600">
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
