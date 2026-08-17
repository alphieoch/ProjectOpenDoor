"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  AlertTriangle, ShieldCheck, ShieldAlert,
  Clock, Loader2, ChevronDown, ChevronUp,
  Key, Scale, Bug, X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { loadGovernanceData } from "@/lib/governance/ensure-client";

const ViolationsTrend = dynamic(
  () => import("./trend-chart").then((m) => m.ViolationsTrend),
  { ssr: false, loading: () => <div style={{ height: 120 }} /> },
);

// ── Types ────────────────────────────────────────────────────────────────────

interface Violation {
  id: string;
  modelId: string;
  dataClass: string;
  violationType: string;
  severity: string;
  actionTaken: string;
  details: Record<string, unknown> | null;
  resolvedAt: string | null;
  createdAt: string;
  policyName: string | null;
  policyAction: string | null;
  apiKeyName: string | null;
}

interface GuardrailOutcome {
  id: string;
  modelId: string;
  guardrailType: string;
  severity: string;
  actionTaken: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

type Tab = "violations" | "guardrails";

// ── Style maps ───────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, { bg: string; color: string }> = {
  low:      { bg: "var(--green-soft)",  color: "var(--green)"  },
  medium:   { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  high:     { bg: "#FEE2E2",            color: "#B91C1C"       },
  critical: { bg: "var(--red-soft)",    color: "var(--red)"    },
};

const ACTION_TAKEN_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  blocked:               { bg: "var(--red-soft)",    color: "var(--red)",    label: "Blocked"   },
  routed_fallback:       { bg: "#DBEAFE",            color: "#1565C0",       label: "Rerouted"  },
  flagged:               { bg: "var(--yellow-soft)", color: "var(--yellow)", label: "Flagged"   },
  allowed_with_approval: { bg: "var(--green-soft)",  color: "var(--green)",  label: "Approved"  },
  block:                 { bg: "var(--red-soft)",    color: "var(--red)",    label: "Blocked"   },
  flag:                  { bg: "var(--yellow-soft)", color: "var(--yellow)", label: "Flagged"   },
  redact:                { bg: "#DBEAFE",            color: "#1565C0",       label: "Redacted"  },
};

const VIOLATION_LABELS: Record<string, { label: string; color: string }> = {
  unapproved_model:    { label: "Unapproved Model",    color: "var(--red)"    },
  data_class_mismatch: { label: "Data Class Mismatch", color: "#D97706"       },
  rate_limit:          { label: "Rate Limit",          color: "#1A73E8"       },
  cost_limit:          { label: "Cost Limit",          color: "var(--yellow)" },
};

const DATA_CLASS_STYLE: Record<string, { bg: string; color: string }> = {
  public:       { bg: "#E9EBF2", color: "#43474E" },
  internal:     { bg: "#D3E4FD", color: "#1A73E8" },
  confidential: { bg: "#FFEFC2", color: "#7A5700" },
  restricted:   { bg: "#F9DEDC", color: "#B3261E" },
};

const GUARDRAIL_META: Record<string, { label: string; icon: React.ElementType }> = {
  pii_detection:    { label: "PII Detection",    icon: ShieldAlert  },
  prompt_injection: { label: "Prompt Injection", icon: Bug          },
  toxicity:         { label: "Toxicity",         icon: AlertTriangle},
  bias:             { label: "Bias Detection",   icon: Scale        },
  secret_scanning:  { label: "Secret Scanning",  icon: Key          },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function toDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

function SeverityBadge({ sev }: { sev: string }) {
  const s = SEVERITY_STYLE[sev] ?? { bg: "var(--paper-3)", color: "var(--ink-2)" };
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
      style={{ background: s.bg, color: s.color }}>{sev}</span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const s = ACTION_TAKEN_STYLE[action] ?? { bg: "var(--paper-3)", color: "var(--ink-2)", label: action };
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

function DataClassBadge({ cls }: { cls: string }) {
  const s = DATA_CLASS_STYLE[cls] ?? { bg: "var(--paper-3)", color: "var(--ink-2)" };
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{ background: s.bg, color: s.color }}>{cls}</span>
  );
}

// ── Violation row (with expandable details) ──────────────────────────────────

function ViolationRow({
  v,
  expanded,
  onToggle,
  onResolve,
}: {
  v: Violation;
  expanded: boolean;
  onToggle: () => void;
  onResolve: () => void;
}) {
  const vt = VIOLATION_LABELS[v.violationType] ?? { label: v.violationType.replace(/_/g, " "), color: "var(--ink-2)" };

  return (
    <>
      <tr
        className="cursor-pointer transition-colors"
        onClick={onToggle}
        style={{ borderBottom: expanded ? "none" : "1px solid var(--line-soft)" }}
      >
        <td className="table-cell">
          <span className="text-sm font-medium capitalize" style={{ color: vt.color }}>
            {vt.label}
          </span>
          {(v.details?.source === "seed" || v.details?.live === false) && (
            <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--paper-3)", color: "var(--ink-4)" }}>
              Example
            </span>
          )}
        </td>
        <td className="table-cell">
          {v.policyName ? (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}>
              {v.policyName}
            </span>
          ) : (
            <span style={{ color: "var(--ink-4)" }}>—</span>
          )}
        </td>
        <td className="table-cell">
          <code className="rounded px-1.5 py-0.5 text-xs"
            style={{ background: "var(--paper-3)", color: "var(--ink-2)", fontFamily: "monospace" }}>
            {v.modelId}
          </code>
        </td>
        <td className="table-cell"><DataClassBadge cls={v.dataClass} /></td>
        <td className="table-cell"><SeverityBadge sev={v.severity} /></td>
        <td className="table-cell"><ActionBadge action={v.actionTaken} /></td>
        <td className="table-cell text-xs" style={{ color: "var(--ink-4)" }}>{timeAgo(v.createdAt)}</td>
        <td className="table-cell text-right">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {v.resolvedAt ? (
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--green)" }}>
                <ShieldCheck className="h-3.5 w-3.5" /> Resolved
              </span>
            ) : (
              <button
                onClick={onResolve}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}
              >
                <Clock className="h-3 w-3" /> Resolve
              </button>
            )}
            {expanded
              ? <ChevronUp className="h-4 w-4" style={{ color: "var(--ink-4)" }} />
              : <ChevronDown className="h-4 w-4" style={{ color: "var(--ink-4)" }} />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <td colSpan={8} className="px-4 pb-4 pt-0">
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--paper-3)" }}>
              <div className="flex flex-wrap gap-6 text-xs">
                {v.apiKeyName && (
                  <div>
                    <span className="font-medium" style={{ color: "var(--ink-3)" }}>API Key: </span>
                    <code style={{ color: "var(--ink-2)" }}>{v.apiKeyName}</code>
                  </div>
                )}
                {v.policyAction && (
                  <div>
                    <span className="font-medium" style={{ color: "var(--ink-3)" }}>Policy action: </span>
                    <span className="capitalize" style={{ color: "var(--ink-2)" }}>{v.policyAction.replace(/_/g, " ")}</span>
                  </div>
                )}
                <div>
                  <span className="font-medium" style={{ color: "var(--ink-3)" }}>Occurred: </span>
                  <span style={{ color: "var(--ink-2)" }}>{new Date(v.createdAt).toLocaleString("en-GB")}</span>
                </div>
                {v.resolvedAt && (
                  <div>
                    <span className="font-medium" style={{ color: "var(--ink-3)" }}>Resolved: </span>
                    <span style={{ color: "var(--green)" }}>{new Date(v.resolvedAt).toLocaleString("en-GB")}</span>
                  </div>
                )}
              </div>
              {v.details && Object.keys(v.details).length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>
                    Details
                  </p>
                  <pre className="overflow-x-auto rounded-lg p-3 text-xs leading-relaxed"
                    style={{ background: "var(--paper-2)", color: "var(--ink-2)", border: "1px solid var(--line-soft)" }}>
                    {JSON.stringify(v.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Guardrail row ────────────────────────────────────────────────────────────

function GuardrailRow({
  o,
  expanded,
  onToggle,
}: {
  o: GuardrailOutcome;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = GUARDRAIL_META[o.guardrailType] ?? { label: o.guardrailType.replace(/_/g, " "), icon: AlertTriangle };
  const Icon = meta.icon;

  return (
    <>
      <tr className="cursor-pointer transition-colors" onClick={onToggle}
        style={{ borderBottom: expanded ? "none" : "1px solid var(--line-soft)" }}>
        <td className="table-cell">
          <span className="flex items-center gap-2 text-sm font-medium capitalize">
            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--red)" }} />
            {meta.label}
          </span>
        </td>
        <td className="table-cell">
          <code className="rounded px-1.5 py-0.5 text-xs"
            style={{ background: "var(--paper-3)", color: "var(--ink-2)", fontFamily: "monospace" }}>
            {o.modelId}
          </code>
        </td>
        <td className="table-cell"><SeverityBadge sev={o.severity} /></td>
        <td className="table-cell"><ActionBadge action={o.actionTaken} /></td>
        <td className="table-cell text-xs" style={{ color: "var(--ink-4)" }}>{timeAgo(o.createdAt)}</td>
        <td className="table-cell text-right">
          {expanded
            ? <ChevronUp className="ml-auto h-4 w-4" style={{ color: "var(--ink-4)" }} />
            : <ChevronDown className="ml-auto h-4 w-4" style={{ color: "var(--ink-4)" }} />}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <td colSpan={6} className="px-4 pb-4 pt-0">
            <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--paper-3)" }}>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                Occurred: {new Date(o.createdAt).toLocaleString("en-GB")}
              </p>
              {o.details && Object.keys(o.details).length > 0 && (
                <pre className="overflow-x-auto rounded-lg p-3 text-xs leading-relaxed"
                  style={{ background: "var(--paper-2)", color: "var(--ink-2)", border: "1px solid var(--line-soft)" }}>
                  {JSON.stringify(o.details, null, 2)}
                </pre>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ViolationsPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [outcomes, setOutcomes] = useState<GuardrailOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardrailsReady, setGuardrailsReady] = useState(false);
  const [tab, setTab] = useState<Tab>("violations");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Violation filters
  const [fSeverity, setFSeverity]   = useState("all");
  const [fResolved, setFResolved]   = useState("open");
  const [fDataClass, setFDataClass] = useState("all");
  const [fTimeframe, setFTimeframe] = useState("30");

  // Guardrail filters
  const [gType, setGType]           = useState("all");
  const [gTimeframe, setGTimeframe] = useState("30");

  const load = useCallback(async () => {
    const data = await loadGovernanceData(
      () => fetch("/api/governance/violations?days=90").then((r) => r.json()),
      {
        isEmpty: (d) => !(d.violations ?? []).length,
        onFirst: (d) => {
          setViolations(d.violations ?? []);
          setLoading(false);
        },
      },
    );
    setViolations(data.violations ?? []);
    setLoading(false);
  }, []);

  const loadGuardrails = useCallback(async () => {
    if (guardrailsReady) return;
    const oData = await fetch("/api/governance/guardrail-outcomes?days=90").then((r) => r.json());
    setOutcomes(oData.outcomes ?? []);
    setGuardrailsReady(true);
  }, [guardrailsReady]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "guardrails") loadGuardrails();
  }, [tab, loadGuardrails]);

  async function resolveViolation(id: string) {
    await fetch(`/api/governance/violations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
    load();
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:    violations.length,
    critical: violations.filter((v) => v.severity === "critical" && !v.resolvedAt).length,
    high:     violations.filter((v) => v.severity === "high" && !v.resolvedAt).length,
    resolved: violations.filter((v) => !!v.resolvedAt).length,
  }), [violations]);

  const filteredViolations = useMemo(() => {
    const cutoff = fTimeframe !== "all" ? new Date(Date.now() - parseInt(fTimeframe) * 864e5) : null;
    return violations.filter((v) => {
      if (fSeverity !== "all" && v.severity !== fSeverity) return false;
      if (fResolved === "open" && v.resolvedAt) return false;
      if (fResolved === "resolved" && !v.resolvedAt) return false;
      if (fDataClass !== "all" && v.dataClass !== fDataClass) return false;
      if (cutoff && new Date(v.createdAt) < cutoff) return false;
      return true;
    });
  }, [violations, fSeverity, fResolved, fDataClass, fTimeframe]);

  const trendData = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      const label = toDateLabel(d.toISOString());
      const count = violations.filter((v) => toDateLabel(v.createdAt) === label).length;
      days.push({ date: label, count });
    }
    return days;
  }, [violations]);

  const filteredOutcomes = useMemo(() => {
    const cutoff = gTimeframe !== "all" ? new Date(Date.now() - parseInt(gTimeframe) * 864e5) : null;
    return outcomes.filter((o) => {
      if (gType !== "all" && o.guardrailType !== gType) return false;
      if (cutoff && new Date(o.createdAt) < cutoff) return false;
      return true;
    });
  }, [outcomes, gType, gTimeframe]);

  const guardrailStats = useMemo(() => {
    const types = ["pii_detection", "prompt_injection", "bias", "toxicity", "secret_scanning"];
    return types.map((t) => ({
      type: t,
      label: GUARDRAIL_META[t]?.label ?? t,
      count: outcomes.filter((o) => o.guardrailType === t).length,
    }));
  }, [outcomes]);

  const hasVFilters = fSeverity !== "all" || fResolved !== "open" || fDataClass !== "all" || fTimeframe !== "30";

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Violations"
        description="Live blocks from the gateway: policy denies, pending-model holds, and guardrail hits. Resolve a row once the team has handled it."
      />

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : (
        <>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total violations", value: stats.total,    color: "var(--ink)"    },
          { label: "Critical open",    value: stats.critical, color: "var(--red)"    },
          { label: "High open",        value: stats.high,     color: "#D97706"       },
          { label: "Resolved",         value: stats.resolved, color: "var(--green)"  },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--ink-4)" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      {violations.length > 0 && (
        <div className="card mb-6 p-5">
          <p className="section-title mb-3">Violations — last 7 days</p>
          <ViolationsTrend data={trendData} />
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {([
          { id: "violations" as Tab, label: "Policy Violations", count: stats.critical + stats.high },
          { id: "guardrails" as Tab, label: "Guardrail Triggers", count: outcomes.length },
        ] as { id: Tab; label: string; count: number }[]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: tab === t.id ? "var(--ink)" : "var(--ink-4)",
              borderBottom: tab === t.id ? "2px solid var(--ink)" : "2px solid transparent",
              marginBottom: "-1px", background: "transparent", cursor: "pointer",
            }}>
            {t.label}
            {t.count > 0 && (
              <span className="rounded-full px-1.5 text-[10px] font-semibold"
                style={{ background: t.id === "violations" ? "var(--red-soft)" : "var(--yellow-soft)",
                  color: t.id === "violations" ? "var(--red)" : "var(--yellow)" }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── POLICY VIOLATIONS TAB ── */}
      {tab === "violations" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { val: fSeverity, set: setFSeverity, opts: [["all","All severities"],["critical","Critical"],["high","High"],["medium","Medium"],["low","Low"]] },
              { val: fResolved, set: setFResolved, opts: [["all","All statuses"],["open","Open only"],["resolved","Resolved only"]] },
              { val: fDataClass, set: setFDataClass, opts: [["all","All data classes"],["restricted","Restricted"],["confidential","Confidential"],["internal","Internal"],["public","Public"]] },
              { val: fTimeframe, set: setFTimeframe, opts: [["1","Last 24h"],["7","Last 7 days"],["30","Last 30 days"],["90","Last 90 days"],["all","All time"]] },
            ].map((f, i) => (
              <select key={i} value={f.val} onChange={(e) => f.set(e.target.value)} className="input w-auto text-sm">
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            {hasVFilters && (
              <button onClick={() => { setFSeverity("all"); setFResolved("open"); setFDataClass("all"); setFTimeframe("30"); }}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: "var(--ink-4)" }}>
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
            <span className="ml-auto text-xs" style={{ color: "var(--ink-4)" }}>
              {filteredViolations.length} of {violations.length}
            </span>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            {violations.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                <ShieldCheck className="h-8 w-8" style={{ color: "var(--ink-4)" }} />
                <p className="text-sm" style={{ color: "var(--ink-3)" }}>No policy violations recorded.</p>
                <p className="text-xs" style={{ color: "var(--ink-4)" }}>Violations appear here when the gateway blocks or flags policy-breaching requests.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
                    <th className="table-header-cell text-left">Type</th>
                    <th className="table-header-cell text-left">Policy</th>
                    <th className="table-header-cell text-left">Model</th>
                    <th className="table-header-cell text-left">Data Class</th>
                    <th className="table-header-cell text-left">Severity</th>
                    <th className="table-header-cell text-left">Action</th>
                    <th className="table-header-cell text-left">Time</th>
                    <th className="table-header-cell text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredViolations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-sm" style={{ color: "var(--ink-4)" }}>
                        No violations match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredViolations.map((v) => (
                      <ViolationRow
                        key={v.id}
                        v={v}
                        expanded={expandedId === v.id}
                        onToggle={() => setExpandedId(expandedId === v.id ? null : v.id)}
                        onResolve={() => resolveViolation(v.id)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── GUARDRAIL TRIGGERS TAB ── */}
      {tab === "guardrails" && !guardrailsReady && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      )}
      {tab === "guardrails" && guardrailsReady && (
        <div className="space-y-4">
          {/* Type stats */}
          <div className="flex flex-wrap gap-2">
            <div className="card flex items-center gap-2 px-4 py-2.5">
              <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                {outcomes.length}
              </span>
              <span className="text-xs" style={{ color: "var(--ink-4)" }}>Total triggered</span>
            </div>
            {guardrailStats.filter((g) => g.count > 0).map((g) => {
              const meta = GUARDRAIL_META[g.type];
              const Icon = meta?.icon ?? AlertTriangle;
              return (
                <div key={g.type} className="card flex items-center gap-2 px-4 py-2.5">
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--red)" }} />
                  <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                    {g.count}
                  </span>
                  <span className="text-xs" style={{ color: "var(--ink-4)" }}>{g.label}</span>
                </div>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select value={gType} onChange={(e) => setGType(e.target.value)} className="input w-auto text-sm">
              <option value="all">All types</option>
              {Object.entries(GUARDRAIL_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </select>
            <select value={gTimeframe} onChange={(e) => setGTimeframe(e.target.value)} className="input w-auto text-sm">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            <span className="self-center ml-auto text-xs" style={{ color: "var(--ink-4)" }}>
              {filteredOutcomes.length} of {outcomes.length}
            </span>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            {outcomes.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                <ShieldCheck className="h-8 w-8" style={{ color: "var(--ink-4)" }} />
                <p className="text-sm" style={{ color: "var(--ink-3)" }}>No guardrail triggers recorded.</p>
                <p className="text-xs" style={{ color: "var(--ink-4)" }}>Guardrail events appear here when PII, prompt injection, or other guards fire.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
                    <th className="table-header-cell text-left">Guardrail</th>
                    <th className="table-header-cell text-left">Model</th>
                    <th className="table-header-cell text-left">Severity</th>
                    <th className="table-header-cell text-left">Action</th>
                    <th className="table-header-cell text-left">Time</th>
                    <th className="table-header-cell text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutcomes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm" style={{ color: "var(--ink-4)" }}>
                        No guardrail events match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredOutcomes.map((o) => (
                      <GuardrailRow
                        key={o.id}
                        o={o}
                        expanded={expandedId === o.id}
                        onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
