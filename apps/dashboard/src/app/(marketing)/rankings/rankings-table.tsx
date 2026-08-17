"use client";

import { useEffect, useState } from "react";

type ChatRate = {
  modelId: string;
  provider: string;
  providerSlug?: string;
  family?: string;
  serverless?: boolean;
  status?: string;
  inputPer1MUsd: number;
  outputPer1MUsd: number;
};

type ProviderStatus = {
  name: string;
  slug: string;
  status: "up" | "down" | "unknown" | "not_configured";
};

type PricingPayload = {
  chat?: ChatRate[];
  updatedAt?: string;
};

type StatusPayload = {
  providers?: ProviderStatus[];
};

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function catalogLabel(status?: string) {
  if (!status) return "unknown";
  return status.replace(/_/g, " ");
}

function providerLabel(status?: string) {
  if (!status || status === "unknown") return "unknown";
  if (status === "up") return "configured";
  if (status === "not_configured") return "not configured";
  return status.replace(/_/g, " ");
}

export function RankingsTable() {
  const [rows, setRows] = useState<
    Array<ChatRate & { providerHealth?: string }>
  >([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/public/pricing", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`Pricing ${r.status}`))
      ),
      fetch("/api/status", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : Promise.resolve({ providers: [] })
      ),
    ])
      .then(([pricing, status]: [PricingPayload, StatusPayload]) => {
        if (cancelled) return;
        const health = new Map(
          (status.providers || []).map((p) => [p.slug, p.status])
        );
        const chat = pricing.chat || [];
        setRows(
          chat.map((r) => ({
            ...r,
            providerHealth: r.providerSlug
              ? health.get(r.providerSlug)
              : undefined,
          }))
        );
        setUpdatedAt(pricing.updatedAt || null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Could not load rankings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <p className="max-w-2xl text-sm leading-6 text-slate-600">
        Price and configured/up status only. This page does not publish latency
        — we do not have a real per-model latency feed.
      </p>
      <div
        className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <table className="od-price-table text-sm">
          <thead>
            <tr>
              <th>Model</th>
              <th>Input / 1M</th>
              <th>Output / 1M</th>
              <th>Catalog</th>
              <th>Provider</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Loading public pricing and status…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {error}
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              rows.map((r) => (
                <tr key={`${r.providerSlug || r.provider}-${r.modelId}`}>
                  <td>
                    <div className="font-medium text-slate-950">{r.modelId}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{r.provider}</div>
                  </td>
                  <td className="font-mono text-base font-semibold">
                    {money(r.inputPer1MUsd)}
                  </td>
                  <td className="font-mono text-base font-semibold">
                    {money(r.outputPer1MUsd)}
                  </td>
                  <td className="text-slate-600">{catalogLabel(r.status)}</td>
                  <td className="text-slate-600">{providerLabel(r.providerHealth)}</td>
                </tr>
              ))}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No public pricing rows yet. Seed the catalog and refresh.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {updatedAt && (
        <p className="mt-3 text-xs text-slate-400">
          Rates as of {updatedAt} · sources: /api/public/pricing, /api/status
        </p>
      )}
    </div>
  );
}
