"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface DailyUsage {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  successCount?: number;
  errorCount?: number;
  cachedCount?: number;
}

interface ModelBreakdownRow {
  modelId: string;
  providerName: string;
  requests: number;
  totalTokens: number;
  costUsd: number;
  avgLatencyMs: number;
}

interface OverviewData {
  totals: { totalRequests: number; totalTokens: number; totalCost: number };
  percentiles: { p50: number; p95: number; p99: number };
  topModels: ModelBreakdownRow[];
}

type Tab = "overview" | "tokens" | "models" | "latency";

const axisTick = { fontSize: 11, fill: "var(--ink-4)" } as const;
const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid var(--line)",
  fontSize: "12px",
  background: "var(--paper-2)",
  color: "var(--ink)",
} as const;

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>
        {label}
      </p>
      <p
        className="mt-2 text-2xl font-semibold tabular-nums"
        style={{ color: accent ?? "var(--ink)" }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-4)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm" style={{ color: "var(--ink-4)" }}>
        No usage data yet
      </p>
    </div>
  );
}

function LoadingChart() {
  return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm" style={{ color: "var(--ink-4)" }}>
        Loading…
      </p>
    </div>
  );
}

export default function UsagePage() {
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [modelSort, setModelSort] = useState<keyof ModelBreakdownRow>("costUsd");

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      const [usageRes, overviewRes] = await Promise.all([
        fetch(`/api/usage?days=${days}`),
        fetch(`/api/analytics/overview?days=${days}`),
      ]);

      if (!cancelled) {
        if (usageRes.ok) {
          const result = await usageRes.json();
          setDaily(
            (result.daily ?? []).map((d: any) => ({
              date: new Date(d.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }),
              requests: Number(d.requests ?? 0),
              promptTokens: Number(d.promptTokens ?? 0),
              completionTokens: Number(d.completionTokens ?? 0),
              totalTokens: Number(d.totalTokens ?? 0),
              costUsd: Number(d.costUsd ?? 0),
              successCount: d.successCount != null ? Number(d.successCount) : undefined,
              errorCount: d.errorCount != null ? Number(d.errorCount) : undefined,
              cachedCount: d.cachedCount != null ? Number(d.cachedCount) : undefined,
            }))
          );
        }
        if (overviewRes.ok) {
          const ov = await overviewRes.json();
          setOverview(ov);
        } else {
          setOverview(null);
        }
        setLoading(false);
      }
    }
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const totals = useMemo(
    () =>
      daily.reduce(
        (acc, d) => ({
          requests: acc.requests + d.requests,
          promptTokens: acc.promptTokens + d.promptTokens,
          completionTokens: acc.completionTokens + d.completionTokens,
          cost: acc.cost + d.costUsd,
          errors: acc.errors + (d.errorCount ?? 0),
          hasStatus: acc.hasStatus || d.errorCount != null,
        }),
        { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0, errors: 0, hasStatus: false }
      ),
    [daily]
  );

  const errorRate =
    totals.hasStatus && totals.requests > 0
      ? ((totals.errors / totals.requests) * 100).toFixed(1) + "%"
      : "—";

  const p50 = overview?.percentiles?.p50
    ? `${Math.round(overview.percentiles.p50)}ms`
    : "—";

  const tokenTotal = totals.promptTokens + totals.completionTokens;
  const promptPct = tokenTotal > 0 ? Math.round((totals.promptTokens / tokenTotal) * 100) : 0;
  const completionPct = 100 - promptPct;

  const sortedModels = useMemo(() => {
    if (!overview?.topModels) return [];
    return [...overview.topModels].sort((a, b) => Number(b[modelSort]) - Number(a[modelSort]));
  }, [overview, modelSort]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "tokens", label: "Tokens" },
    { id: "models", label: "Models" },
    { id: "latency", label: "Latency" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="page-title">Usage</h1>
          <p className="page-desc">Track your LLM consumption and costs</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="input w-auto"
          aria-label="Select time range"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Requests" value={formatNumber(totals.requests)} />
        <StatCard
          label="Prompt Tokens"
          value={formatNumber(totals.promptTokens)}
          sub="input"
          accent="var(--blue)"
        />
        <StatCard
          label="Completion Tokens"
          value={formatNumber(totals.completionTokens)}
          sub="output"
          accent="var(--green)"
        />
        <StatCard label="Total Cost" value={formatCurrency(totals.cost)} />
        <StatCard label="p50 Latency" value={p50} sub="median response" />
        <StatCard
          label="Error Rate"
          value={errorRate}
          accent={totals.hasStatus && totals.errors > 0 ? "var(--red)" : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="mt-6">
        <div
          className="flex gap-1 border-b"
          style={{ borderColor: "var(--line-soft)" }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                color: tab === t.id ? "var(--ink)" : "var(--ink-4)",
                borderBottom: tab === t.id ? "2px solid var(--ink)" : "2px solid transparent",
                marginBottom: "-1px",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <div className="mt-5 space-y-5">
            <div className="card p-6">
              <h2 className="section-title mb-4">Daily Requests</h2>
              {loading ? (
                <LoadingChart />
              ) : daily.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={daily} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--paper-3)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {daily[0]?.successCount != null ? (
                      <>
                        <Bar dataKey="successCount" name="Success" stackId="a" fill="var(--green)" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="cachedCount" name="Cached" stackId="a" fill="var(--blue)" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="errorCount" name="Error" stackId="a" fill="var(--red)" radius={[4, 4, 0, 0]} />
                      </>
                    ) : (
                      <Bar dataKey="requests" name="Requests" fill="var(--ink)" radius={[4, 4, 0, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-6">
              <h2 className="section-title mb-4">Daily Cost</h2>
              {loading ? (
                <LoadingChart />
              ) : daily.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      tickFormatter={(v) => formatCurrency(v)}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [formatCurrency(v), "Cost"]}
                      cursor={{ stroke: "var(--line)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="costUsd"
                      name="Cost"
                      stroke="var(--green)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* Tokens tab */}
        {tab === "tokens" && (
          <div className="mt-5 space-y-5">
            {/* Token ratio callout */}
            <div className="card p-5 flex items-center gap-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>
                  Input / Output Split
                </p>
                <p className="mt-1 text-lg font-semibold" style={{ color: "var(--ink)" }}>
                  {promptPct}% input · {completionPct}% output
                </p>
              </div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--paper-3)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${promptPct}%`,
                    background: "linear-gradient(90deg, var(--blue) 0%, var(--green) 100%)",
                  }}
                />
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: "var(--ink-4)" }}>Total</p>
                <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                  {formatNumber(tokenTotal)}
                </p>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="section-title mb-4">Daily Token Usage</h2>
              {loading ? (
                <LoadingChart />
              ) : daily.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={daily}>
                    <defs>
                      <linearGradient id="gradPrompt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--blue)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradCompletion" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--green)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--green)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                      width={55}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number, name: string) => [formatNumber(v), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="promptTokens"
                      name="Prompt (input)"
                      stackId="1"
                      stroke="var(--blue)"
                      strokeWidth={2}
                      fill="url(#gradPrompt)"
                    />
                    <Area
                      type="monotone"
                      dataKey="completionTokens"
                      name="Completion (output)"
                      stackId="1"
                      stroke="var(--green)"
                      strokeWidth={2}
                      fill="url(#gradCompletion)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* Models tab */}
        {tab === "models" && (
          <div className="mt-5">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--line-soft)" }}>
                <h2 className="section-title">Top Models</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--ink-4)" }}>Sort by</span>
                  <select
                    value={modelSort}
                    onChange={(e) => setModelSort(e.target.value as keyof ModelBreakdownRow)}
                    className="input text-xs py-1 h-auto w-auto"
                    aria-label="Sort models by"
                  >
                    <option value="costUsd">Cost</option>
                    <option value="requests">Requests</option>
                    <option value="totalTokens">Tokens</option>
                    <option value="avgLatencyMs">Latency</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <p className="text-sm" style={{ color: "var(--ink-4)" }}>Loading…</p>
                </div>
              ) : !overview ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2">
                  <p className="text-sm font-medium" style={{ color: "var(--ink-3)" }}>Analytics engine unavailable</p>
                  <p className="text-xs" style={{ color: "var(--ink-4)" }}>Enable DuckDB analytics to view model breakdowns</p>
                </div>
              ) : sortedModels.length === 0 ? (
                <div className="flex h-40 items-center justify-center">
                  <p className="text-sm" style={{ color: "var(--ink-4)" }}>No model data yet</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
                      <th className="table-header-cell text-left">Model</th>
                      <th className="table-header-cell text-left">Provider</th>
                      <th className="table-header-cell text-right">Requests</th>
                      <th className="table-header-cell text-right">Input Tokens</th>
                      <th className="table-header-cell text-right">Output Tokens</th>
                      <th className="table-header-cell text-right">Cost</th>
                      <th className="table-header-cell text-right">Avg Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedModels.map((m, i) => (
                      <tr
                        key={m.modelId + i}
                        style={{ borderBottom: "1px solid var(--line-soft)" }}
                      >
                        <td className="table-cell font-mono text-xs">{m.modelId}</td>
                        <td className="table-cell" style={{ color: "var(--ink-3)" }}>
                          {m.providerName}
                        </td>
                        <td className="table-cell text-right tabular-nums">{formatNumber(m.requests)}</td>
                        <td className="table-cell text-right tabular-nums" style={{ color: "var(--blue)" }}>
                          {formatNumber(Math.round(m.totalTokens * (totals.promptTokens / (totals.promptTokens + totals.completionTokens || 1))))}
                        </td>
                        <td className="table-cell text-right tabular-nums" style={{ color: "var(--green)" }}>
                          {formatNumber(Math.round(m.totalTokens * (totals.completionTokens / (totals.promptTokens + totals.completionTokens || 1))))}
                        </td>
                        <td className="table-cell text-right tabular-nums font-medium">
                          {formatCurrency(Number(m.costUsd))}
                        </td>
                        <td className="table-cell text-right tabular-nums" style={{ color: "var(--ink-3)" }}>
                          {m.avgLatencyMs ? `${Math.round(Number(m.avgLatencyMs))}ms` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Latency tab */}
        {tab === "latency" && (
          <div className="mt-5 space-y-5">
            {/* Percentile cards */}
            <div className="grid grid-cols-3 gap-4">
              {(["p50", "p95", "p99"] as const).map((pct) => (
                <div key={pct} className="card p-6 text-center">
                  <p
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {pct.toUpperCase()}
                  </p>
                  <p
                    className="mt-3 text-4xl font-semibold tabular-nums"
                    style={{ color: "var(--ink)" }}
                  >
                    {overview?.percentiles?.[pct]
                      ? Math.round(overview.percentiles[pct])
                      : "—"}
                  </p>
                  {overview?.percentiles?.[pct] && (
                    <p className="mt-1 text-sm" style={{ color: "var(--ink-4)" }}>
                      ms
                    </p>
                  )}
                </div>
              ))}
            </div>

            {!overview && (
              <div
                className="card p-5 text-center text-sm"
                style={{ color: "var(--ink-4)", background: "var(--paper)" }}
              >
                Latency analytics require the DuckDB analytics engine to be enabled.
              </div>
            )}

            {/* Top models by latency */}
            {overview && overview.topModels.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b" style={{ borderColor: "var(--line-soft)" }}>
                  <h2 className="section-title">Models by Latency</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
                      <th className="table-header-cell text-left">Model</th>
                      <th className="table-header-cell text-left">Provider</th>
                      <th className="table-header-cell text-right">Requests</th>
                      <th className="table-header-cell text-right">Avg Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...overview.topModels]
                      .sort((a, b) => Number(b.avgLatencyMs) - Number(a.avgLatencyMs))
                      .map((m, i) => (
                        <tr
                          key={m.modelId + i}
                          style={{ borderBottom: "1px solid var(--line-soft)" }}
                        >
                          <td className="table-cell font-mono text-xs">{m.modelId}</td>
                          <td className="table-cell" style={{ color: "var(--ink-3)" }}>
                            {m.providerName}
                          </td>
                          <td className="table-cell text-right tabular-nums">
                            {formatNumber(m.requests)}
                          </td>
                          <td className="table-cell text-right tabular-nums font-medium">
                            {m.avgLatencyMs ? `${Math.round(Number(m.avgLatencyMs))}ms` : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
