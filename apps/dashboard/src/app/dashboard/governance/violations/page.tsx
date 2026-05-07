"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck, Clock, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Violation {
  id: string;
  modelId: string;
  dataClass: string;
  violationType: string;
  severity: string;
  actionTaken: string;
  details: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
}

const severityStyle: Record<string, { bg: string; color: string }> = {
  low:      { bg: "var(--green-soft)",  color: "var(--green)"  },
  medium:   { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  high:     { bg: "#FEE2E2",            color: "#B91C1C"       },
  critical: { bg: "var(--red-soft)",    color: "var(--red)"    },
};

export default function ViolationsPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterResolved, setFilterResolved] = useState("false");
  const [filterModel, setFilterModel] = useState("all");
  const [filterDataClass, setFilterDataClass] = useState("all");
  const [timeframe, setTimeframe] = useState("7");

  useEffect(() => { loadViolations(); }, [filterSeverity, filterResolved]);

  async function loadViolations() {
    const params = new URLSearchParams();
    if (filterSeverity !== "all") params.set("severity", filterSeverity);
    if (filterResolved !== "all") params.set("resolved", filterResolved);
    const res = await fetch(`/api/governance/violations?${params.toString()}`);
    const data = await res.json();
    let items: Violation[] = data.violations || [];
    if (filterModel !== "all") items = items.filter((v) => v.modelId === filterModel);
    if (filterDataClass !== "all") items = items.filter((v) => v.dataClass === filterDataClass);
    if (timeframe !== "all") {
      const cutoff = new Date(Date.now() - parseInt(timeframe) * 864e5);
      items = items.filter((v) => new Date(v.createdAt) >= cutoff);
    }
    setViolations(items);
    setLoading(false);
  }

  async function resolveViolation(id: string) {
    await fetch(`/api/governance/violations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
    loadViolations();
  }

  const modelOptions = Array.from(new Set(violations.map((v) => v.modelId)));
  const stats = {
    total:    violations.length,
    critical: violations.filter((v) => v.severity === "critical" && !v.resolvedAt).length,
    high:     violations.filter((v) => v.severity === "high"     && !v.resolvedAt).length,
    resolved: violations.filter((v) => v.resolvedAt).length,
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Violations</h1>
        <p className="page-desc">Guardrail triggers, policy breaches, and blocked requests.</p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Total", value: stats.total, color: "var(--ink)" },
              { label: "Critical open", value: stats.critical, color: "var(--red)" },
              { label: "High open", value: stats.high, color: "#D97706" },
              { label: "Resolved", value: stats.resolved, color: "var(--green)" },
            ].map((s) => (
              <div key={s.label} className="card p-4">
                <div className="text-xs" style={{ color: "var(--ink-3)" }}>{s.label}</div>
                <div className="mt-1 text-2xl font-semibold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {[
              { value: filterSeverity, onChange: setFilterSeverity, options: [["all","All Severities"],["critical","Critical"],["high","High"],["medium","Medium"],["low","Low"]] },
              { value: filterResolved, onChange: setFilterResolved, options: [["all","All"],["false","Open only"],["true","Resolved only"]] },
              { value: filterModel,    onChange: setFilterModel,    options: [["all","All Models"], ...modelOptions.map((m) => [m, m])] },
              { value: filterDataClass,onChange: setFilterDataClass,options: [["all","All Data Classes"],["public","Public"],["internal","Internal"],["confidential","Confidential"],["restricted","Restricted"]] },
              { value: timeframe,      onChange: setTimeframe,      options: [["1","Last 24h"],["7","Last 7 days"],["30","Last 30 days"],["90","Last 90 days"],["all","All time"]] },
            ].map((f, i) => (
              <select key={i} value={f.value} onChange={(e) => f.onChange(e.target.value)} className="input w-auto">
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Data class</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Action taken</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Resolve</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {violations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center" style={{ color: "var(--ink-3)" }}>
                      No violations match the current filters.
                    </TableCell>
                  </TableRow>
                ) : violations.map((v) => {
                  const sev = severityStyle[v.severity] ?? { bg: "var(--paper-3)", color: "var(--ink-2)" };
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium" style={{ color: "var(--ink)" }}>{v.violationType}</TableCell>
                      <TableCell style={{ color: "var(--ink-2)" }}>{v.modelId}</TableCell>
                      <TableCell className="capitalize" style={{ color: "var(--ink-2)" }}>{v.dataClass}</TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                          style={{ background: sev.bg, color: sev.color }}>
                          {v.severity}
                        </span>
                      </TableCell>
                      <TableCell style={{ color: "var(--ink-2)" }}>{v.actionTaken}</TableCell>
                      <TableCell style={{ color: "var(--ink-3)" }}>{new Date(v.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {v.resolvedAt ? (
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--green)" }}>
                            <ShieldCheck className="h-3.5 w-3.5" /> Resolved
                          </span>
                        ) : (
                          <button onClick={() => resolveViolation(v.id)} className="btn-ghost btn-sm">
                            <Clock className="h-3.5 w-3.5" /> Resolve
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
