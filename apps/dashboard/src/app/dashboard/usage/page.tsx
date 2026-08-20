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
import Link from "next/link";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import {
  errorRateLabel,
  formatLatencyMs,
  periodEmptyCopy,
  splitModelTokens,
  summarizeDailyUsage,
  tokenSplit,
  unlimitedReasonLabel,
} from "@/lib/usage-format";

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
  promptTokens?: number;
  completionTokens?: number;
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

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" } as const;
const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid hsl(var(--border))",
  fontSize: "12px",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
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
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
        {label}
      </p>
      <p
        className="mt-2 text-2xl font-semibold tabular-nums"
        style={{ color: accent ?? "hsl(var(--foreground))" }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function EmptyChart({ days }: { days: number }) {
  const copy = periodEmptyCopy(days);
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-foreground">{copy.title}</p>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/dashboard/playground" className="btn-secondary">
          Open playground
        </Link>
        <Link href="/dashboard/api-keys" className="btn-secondary">
          Create an API key
        </Link>
      </div>
    </div>
  );
}

function LoadingChart() {
  return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
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
  const [error, setError] = useState<string | null>(null);
  const [unlimited, setUnlimited] = useState(false);
  const [unlimitedReason, setUnlimitedReason] = useState<"site_admin" | "plan" | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [modelSort, setModelSort] = useState<keyof ModelBreakdownRow>("costUsd");

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const usageRes = await fetch(`/api/usage?days=${days}`, { credentials: "include" });
        const result = await usageRes.json().catch(() => ({}));
        if (!usageRes.ok) {
          if (!cancelled) {
            setError(result.error || "Failed to load usage.");
            setDaily([]);
            setOverview(null);
          }
          return;
        }
        if (cancelled) return;
        setUnlimited(Boolean(result.unlimited));
        setUnlimitedReason(result.unlimitedReason || null);
        setDaily(
          (result.daily ?? []).map((d: Record<string, unknown>) => ({
            date: new Date(String(d.date)).toLocaleDateString("en-US", {
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
          })),
        );
        if (result.overview) {
          setOverview(result.overview);
        } else {
          const overviewRes = await fetch(`/api/analytics/overview?days=${days}`, { credentials: "include" });
          setOverview(overviewRes.ok ? await overviewRes.json() : null);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load usage.");
          setDaily([]);
          setOverview(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const totals = useMemo(() => summarizeDailyUsage(daily), [daily]);
  const errorRate = errorRateLabel(totals.errors, totals.requests, totals.hasStatus);
  const p50 = formatLatencyMs(overview?.percentiles?.p50);
  const split = tokenSplit(totals.promptTokens, totals.completionTokens);
  const tokenTotal = split.total;
  const promptPct = split.promptPct;
  const completionPct = split.completionPct;

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
      <PageHeader
        eyebrow="Observability"
        title="Usage explorer"
        description="Request volume, tokens, and spend across this billing window."
        actions={
          <>
            <Link href="/dashboard/logs" className="btn-secondary">
              Request logs
            </Link>
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
          </>
        }
      />

      {error && (
        <div className="mb-6 alert-error">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {unlimited && (
        <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
          {unlimitedReasonLabel(unlimitedReason)}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Requests"
          value={formatNumber(totals.requests)}
          series={daily.map((d) => d.requests)}
        />
        <MetricCard
          label={unlimited ? "Metered cost (not billed)" : "Total cost"}
          value={formatCurrency(totals.cost)}
          series={daily.map((d) => d.costUsd)}
          featured
        />
        <MetricCard
          label="p50 latency"
          value={p50}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" style={{ marginBottom: 8 }}>
        <StatCard label="Prompt tokens" value={formatNumber(totals.promptTokens)} sub="input" accent="var(--blue)" />
        <StatCard label="Completion tokens" value={formatNumber(totals.completionTokens)} sub="output" accent="var(--green)" />
        <StatCard
          label="Error rate"
          value={errorRate}
          accent={totals.hasStatus && totals.errors > 0 ? "var(--red)" : undefined}
        />
      </div>

      <div className="mt-6">
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 mb-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
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
                <EmptyChart days={days} />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={daily} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--accent))" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {daily[0]?.successCount != null ? (
                      <>
                        <Bar dataKey="successCount" name="Success" stackId="a" fill="var(--green)" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="cachedCount" name="Cached" stackId="a" fill="var(--blue)" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="errorCount" name="Error" stackId="a" fill="var(--red)" radius={[4, 4, 0, 0]} />
                      </>
                    ) : (
                      <Bar dataKey="requests" name="Requests" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} />
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
                <EmptyChart days={days} />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
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
                      cursor={{ stroke: "hsl(var(--border))" }}
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
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Input / Output Split
                </p>
                <p className="mt-1 text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  {promptPct}% input · {completionPct}% output
                </p>
              </div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "hsl(var(--accent))" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${promptPct}%`,
                    background: "linear-gradient(90deg, var(--blue) 0%, var(--green) 100%)",
                  }}
                />
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Total</p>
                <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  {formatNumber(tokenTotal)}
                </p>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="section-title mb-4">Daily Token Usage</h2>
              {loading ? (
                <LoadingChart />
              ) : daily.length === 0 ? (
                <EmptyChart days={days} />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
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
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
                <h2 className="section-title">Top Models</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Sort by</span>
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
                  <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</p>
                </div>
              ) : sortedModels.length === 0 ? (
                <div className="flex h-40 items-center justify-center">
                  <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No model data yet</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
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
                        style={{ borderBottom: "1px solid hsl(var(--border))" }}
                      >
                        <td className="table-cell font-mono text-xs">{m.modelId}</td>
                        <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {m.providerName}
                        </td>
                        <td className="table-cell text-right tabular-nums">{formatNumber(m.requests)}</td>
                        <td className="table-cell text-right tabular-nums" style={{ color: "var(--blue)" }}>
                          {formatNumber(
                            splitModelTokens({
                              totalTokens: m.totalTokens,
                              promptTokens: m.promptTokens,
                              completionTokens: m.completionTokens,
                              orgPromptTokens: totals.promptTokens,
                              orgCompletionTokens: totals.completionTokens,
                            }).promptTokens,
                          )}
                        </td>
                        <td className="table-cell text-right tabular-nums" style={{ color: "var(--green)" }}>
                          {formatNumber(
                            splitModelTokens({
                              totalTokens: m.totalTokens,
                              promptTokens: m.promptTokens,
                              completionTokens: m.completionTokens,
                              orgPromptTokens: totals.promptTokens,
                              orgCompletionTokens: totals.completionTokens,
                            }).completionTokens,
                          )}
                        </td>
                        <td className="table-cell text-right tabular-nums font-medium">
                          {formatCurrency(Number(m.costUsd))}
                        </td>
                        <td className="table-cell text-right tabular-nums" style={{ color: "hsl(var(--muted-foreground))" }}>
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
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    {pct.toUpperCase()}
                  </p>
                  <p
                    className="mt-3 text-4xl font-semibold tabular-nums"
                    style={{ color: "hsl(var(--foreground))" }}
                  >
                    {overview?.percentiles?.[pct]
                      ? Math.round(overview.percentiles[pct])
                      : "—"}
                  </p>
                  {overview?.percentiles?.[pct] && (
                    <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                      ms
                    </p>
                  )}
                </div>
              ))}
            </div>

            {!overview && !loading && (
              <div className="card p-5 text-center text-sm text-muted-foreground">
                No latency samples in this period.
              </div>
            )}

            {/* Top models by latency */}
            {overview && overview.topModels.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
                  <h2 className="section-title">Models by Latency</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
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
                          style={{ borderBottom: "1px solid hsl(var(--border))" }}
                        >
                          <td className="table-cell font-mono text-xs">{m.modelId}</td>
                          <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
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
