"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ShieldCheck,
  Clock,
  Filter,
} from "lucide-react";

interface Violation {
  id: string;
  modelId: string;
  dataClass: string;
  violationType: string;
  severity: string;
  actionTaken: string;
  details: Record<string, any>;
  resolvedAt: string | null;
  createdAt: string;
}

const severityColors: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export default function ViolationsPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterResolved, setFilterResolved] = useState<string>("false");
  const [filterModel, setFilterModel] = useState<string>("all");
  const [filterDataClass, setFilterDataClass] = useState<string>("all");
  const [timeframe, setTimeframe] = useState<string>("7");

  useEffect(() => {
    loadViolations();
  }, [filterSeverity, filterResolved]);

  async function loadViolations() {
    const params = new URLSearchParams();
    if (filterSeverity !== "all") params.set("severity", filterSeverity);
    if (filterResolved !== "all") params.set("resolved", filterResolved);
    const res = await fetch(`/api/governance/violations?${params.toString()}`);
    const data = await res.json();
    let items = data.violations || [];
    // Client-side filters for model and data class
    if (filterModel !== "all") {
      items = items.filter((v: Violation) => v.modelId === filterModel);
    }
    if (filterDataClass !== "all") {
      items = items.filter((v: Violation) => v.dataClass === filterDataClass);
    }
    if (timeframe !== "all") {
      const days = parseInt(timeframe);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      items = items.filter((v: Violation) => new Date(v.createdAt) >= cutoff);
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  const stats = {
    total: violations.length,
    critical: violations.filter((v) => v.severity === "critical" && !v.resolvedAt).length,
    high: violations.filter((v) => v.severity === "high" && !v.resolvedAt).length,
    resolved: violations.filter((v) => v.resolvedAt).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Policy Violations</h1>
        <p className="text-sm text-gray-500">
          Guardrail triggers, policy breaches, and blocked requests. Filter by model, data class, severity, and timeframe for incident review.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Total</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Critical Open</div>
          <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">High Open</div>
          <div className="text-2xl font-bold text-orange-600">{stats.high}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Resolved</div>
          <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterResolved}
          onChange={(e) => setFilterResolved(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">All</option>
          <option value="false">Open Only</option>
          <option value="true">Resolved Only</option>
        </select>
        <select
          value={filterModel}
          onChange={(e) => setFilterModel(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">All Models</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={filterDataClass}
          onChange={(e) => setFilterDataClass(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">All Data Classes</option>
          <option value="public">Public</option>
          <option value="internal">Internal</option>
          <option value="confidential">Confidential</option>
          <option value="restricted">Restricted</option>
        </select>
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Model</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Data Class</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Severity</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action Taken</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Time</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Resolve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {violations.map((v) => (
              <tr key={v.id}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{v.violationType}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{v.modelId}</td>
                <td className="px-6 py-4 text-sm text-gray-700 capitalize">{v.dataClass}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${severityColors[v.severity] || "bg-gray-100 text-gray-800"}`}>
                    {v.severity}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">{v.actionTaken}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(v.createdAt).toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                  {v.resolvedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <ShieldCheck className="h-4 w-4" /> Resolved
                    </span>
                  ) : (
                    <button
                      onClick={() => resolveViolation(v.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50"
                    >
                      <Clock className="h-3 w-3" /> Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
