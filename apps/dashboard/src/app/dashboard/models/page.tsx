"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Loader2, List } from "lucide-react";

type ModelRow = { id: string; label: string; provider: string };

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [plan, setPlan] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [mRes, bRes] = await Promise.all([
          fetch("/api/models/available", { credentials: "include" }),
          fetch("/api/billing/info", { credentials: "include" }),
        ]);
        if (!mRes.ok) {
          const t = await mRes.text();
          throw new Error(t || "Failed to load models");
        }
        const mJson = (await mRes.json()) as { models?: ModelRow[] };
        const rows = Array.isArray(mJson.models) ? mJson.models : [];

        let p: string | null = null;
        let sub: string | null = null;
        if (bRes.ok) {
          const bJson = (await bRes.json()) as { org?: { plan?: string; subscriptionStatus?: string | null } };
          p = bJson.org?.plan ?? null;
          sub = bJson.org?.subscriptionStatus ?? null;
        }

        if (!cancelled) {
          setModels(rows);
          setPlan(p);
          setSubscriptionStatus(sub);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
    );
  }, [models, query]);

  function copyId(id: string) {
    void navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Models</h1>
        <p className="page-desc">
          Models your organization can use on the gateway (enabled catalog plus your running custom deployments).
          Your subscription and plan affect pricing and allowances—see Billing. API keys can further restrict which
          models a key may call.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--paper-2)" }}
        >
          <span style={{ color: "var(--ink-3)" }}>Plan</span>
          <span className="font-medium capitalize" style={{ color: "var(--ink)" }}>
            {plan ?? "—"}
          </span>
          {subscriptionStatus && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--paper-3)", color: "var(--ink-3)" }}>
              {subscriptionStatus}
            </span>
          )}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by id, name, or provider…"
          className="input max-w-md flex-1 min-w-[200px]"
          aria-label="Filter models"
        />
      </div>

      {error && (
        <div className="alert-error mb-4" role="alert">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2" style={{ color: "var(--ink-3)" }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading models…</span>
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="table-header-cell">Model ID</th>
                <th className="table-header-cell">Display name</th>
                <th className="table-header-cell">Provider</th>
                <th className="table-header-cell text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="table-row">
                  <td className="table-cell font-mono text-sm" style={{ color: "var(--ink)" }}>
                    {m.id}
                  </td>
                  <td className="table-cell" style={{ color: "var(--ink-2)" }}>
                    {m.label}
                  </td>
                  <td className="table-cell" style={{ color: "var(--ink-3)" }}>
                    {m.provider}
                  </td>
                  <td className="table-cell text-right">
                    <button
                      type="button"
                      onClick={() => copyId(m.id)}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--paper-3)]"
                      style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
                      aria-label={`Copy model id ${m.id}`}
                    >
                      {copiedId === m.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === m.id ? "Copied" : "Copy ID"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm" style={{ color: "var(--ink-4)" }}>
                    No models match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {!loading && models.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm" style={{ color: "var(--ink-3)" }}>
          <List className="h-4 w-4 shrink-0" />
          Showing {filtered.length} of {models.length} models.
        </p>
      )}
    </div>
  );
}
