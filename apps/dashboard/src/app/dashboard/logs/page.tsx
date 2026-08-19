"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency, formatNumber } from "@/lib/utils";

type LogRow = {
  id: string;
  modelId: string;
  requestType: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  costUsd: number;
  status: string;
  errorMessage: string | null;
  region: string;
  createdAt: string;
  provider: string | null;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
};

export default function LogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams({ limit: "50" });
      if (status !== "all") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      setLoading(true);
      fetch(`/api/requests?${params}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { requests: [], total: 0 }))
        .then((data) => {
          setRows(data.requests || []);
          setTotal(Number(data.total || 0));
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [status, q]);

  return (
    <div>
      <PageHeader
        eyebrow="Observability"
        title="Request logs"
        description="Every gateway call for this workspace — model, tokens, latency, and spend."
        actions={
          <Link href="/dashboard/usage" className="btn-secondary">
            Usage explorer
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by model or region…"
        />
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="cached">Cached</option>
        </select>
        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {formatNumber(total)} requests
        </span>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="table-header-cell">Time</th>
              <th className="table-header-cell">Model</th>
              <th className="table-header-cell">Type</th>
              <th className="table-header-cell">Status</th>
              <th className="table-header-cell">Tokens</th>
              <th className="table-header-cell">Latency</th>
              <th className="table-header-cell">Cost</th>
              <th className="table-header-cell">Key</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <ScrollText className="mx-auto mb-3 h-8 w-8" style={{ color: "hsl(var(--muted-foreground))" }} />
                  <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                    No requests yet. Make a playground or API call and it will show up here.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="table-row">
                  <td className="table-cell whitespace-nowrap" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="table-cell">
                    <div className="font-medium" style={{ color: "hsl(var(--foreground))" }}>
                      {row.modelId}
                    </div>
                    <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {row.provider || "—"} · {row.region}
                    </div>
                  </td>
                  <td className="table-cell font-mono text-xs">{row.requestType}</td>
                  <td className="table-cell">
                    <span
                      className={
                        row.status === "error"
                          ? "badge-error"
                          : row.status === "cached"
                            ? "badge-info"
                            : "badge-success"
                      }
                    >
                      {row.status}
                    </span>
                    {row.errorMessage ? (
                      <div className="mt-1 max-w-xs truncate text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {row.errorMessage}
                      </div>
                    ) : null}
                  </td>
                  <td className="table-cell tabular-nums">
                    {formatNumber(row.totalTokens)}
                    <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {formatNumber(row.promptTokens)} in / {formatNumber(row.completionTokens)} out
                    </div>
                  </td>
                  <td className="table-cell tabular-nums">
                    {row.latencyMs > 0 ? `${row.latencyMs}ms` : "—"}
                  </td>
                  <td className="table-cell tabular-nums">{formatCurrency(row.costUsd)}</td>
                  <td className="table-cell font-mono text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {row.apiKeyPrefix ? `${row.apiKeyPrefix}…` : row.apiKeyName || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
