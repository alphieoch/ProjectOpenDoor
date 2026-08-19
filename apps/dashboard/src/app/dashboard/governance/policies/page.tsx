"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Plus, Trash2, CheckCircle2, XCircle, Loader2,
  Search, Pencil, ShieldAlert, ShieldCheck, Shield,
  ChevronDown, Layers, X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { loadGovernanceData } from "@/lib/governance/ensure-client";

interface Policy {
  id: string;
  name: string;
  description: string | null;
  dataClass: string;
  modelIdPattern: string | null;
  userRolePattern: string | null;
  fallbackModelId: string | null;
  action: string;
  requireHumanApproval: boolean;
  enabled: boolean;
  priority: number;
  scope: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ── Style maps ──────────────────────────────────────────────────────────────

const ACTION_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  allow:            { bg: "var(--green-soft)",  color: "var(--green)",  label: "Allow" },
  deny:             { bg: "var(--red-soft)",    color: "var(--red)",    label: "Deny" },
  require_approval: { bg: "var(--yellow-soft)", color: "var(--yellow)", label: "Require Approval" },
  route_fallback:   { bg: "#DBEAFE",            color: "#1565C0",       label: "Route Fallback" },
};

const DATA_CLASS_STYLE: Record<string, { bg: string; color: string }> = {
  public:       { bg: "#E9EBF2", color: "#43474E" },
  internal:     { bg: "hsl(221 83% 97%)", color: "#0F172A" },
  confidential: { bg: "#FFEFC2", color: "#7A5700" },
  restricted:   { bg: "#F9DEDC", color: "#B3261E" },
};

const SECTOR_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  legal:      { bg: "hsl(221 83% 97%)", color: "#0F172A", label: "Legal" },
  finance:    { bg: "#C8EDD9", color: "#1E6E4F", label: "Finance" },
  property:   { bg: "#FFEFC2", color: "#7A5700", label: "Property" },
  healthcare: { bg: "#F9DEDC", color: "#B3261E", label: "Healthcare" },
  government: { bg: "#E3E7FF", color: "#4B5FBF", label: "Government" },
  insurance:  { bg: "#BBDEFB", color: "#1565C0", label: "Insurance" },
  education:  { bg: "#EFEBE9", color: "#5B4037", label: "Education" },
  energy:     { bg: "#FFE0B2", color: "#E65100", label: "Energy" },
  retail:     { bg: "#FCE4EC", color: "#880E4F", label: "Retail" },
  media:      { bg: "#EDE7F6", color: "#4A148C", label: "Media" },
  transport:  { bg: "#E0F7FA", color: "#006064", label: "Transport" },
  general:    { bg: "#E9EBF2", color: "#43474E", label: "General" },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const s = ACTION_STYLE[action] ?? { bg: "hsl(var(--accent))", color: "hsl(var(--muted-foreground))", label: action };
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function DataClassBadge({ cls }: { cls: string }) {
  const s = DATA_CLASS_STYLE[cls] ?? { bg: "hsl(var(--accent))", color: "hsl(var(--muted-foreground))" };
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
      style={{ background: s.bg, color: s.color }}>
      {cls}
    </span>
  );
}

function SourceBadge({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata) return null;
  const sector = metadata.sector as string | undefined;
  const source = metadata.source as string | undefined;
  if (source === "baseline_defaults") {
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{ background: "hsl(var(--accent))", color: "hsl(var(--muted-foreground))" }}>
        Baseline
      </span>
    );
  }
  if (sector && SECTOR_STYLE[sector]) {
    const s = SECTOR_STYLE[sector];
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{ background: s.bg, color: s.color }}>
        {s.label}
      </span>
    );
  }
  return null;
}

// ── Form blank ───────────────────────────────────────────────────────────────

const BLANK: Partial<Policy> = {
  action: "allow", dataClass: "internal", enabled: true, priority: 100,
  requireHumanApproval: false, modelIdPattern: "*", scope: "organization",
};

// ── Create / Edit modal ──────────────────────────────────────────────────────

function PolicyModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<Policy>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Policy>>(initial);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial.id;

  function set(key: keyof Policy, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const url = isEdit ? `/api/governance/policies/${initial.id}` : "/api/governance/policies";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) { onSaved(); onClose(); }
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Could not save this policy.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="card w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "hsl(var(--border))" }}>
          <h2 className="section-title">{isEdit ? "Edit policy" : "New policy"}</h2>
          <button type="button" onClick={onClose} className="md-icon-btn">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
              Name <span style={{ color: "var(--red)" }}>*</span>
            </label>
            <input required value={form.name ?? ""} onChange={(e) => set("name", e.target.value)}
              className="input w-full" placeholder="e.g. Block Restricted Data" />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Description</label>
            <textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)}
              className="input w-full" rows={2} placeholder="Optional — explain when this policy applies" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Action */}
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Action</label>
              <select value={form.action} onChange={(e) => set("action", e.target.value)} className="input w-full">
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="require_approval">Require Approval</option>
                <option value="route_fallback">Route Fallback</option>
              </select>
            </div>

            {/* Data class */}
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Data class</label>
              <select value={form.dataClass} onChange={(e) => set("dataClass", e.target.value)} className="input w-full">
                {["public", "internal", "confidential", "restricted"].map((v) => (
                  <option key={v} value={v} className="capitalize">{v}</option>
                ))}
              </select>
            </div>

            {/* Model pattern */}
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Model pattern</label>
              <input value={form.modelIdPattern ?? ""} onChange={(e) => set("modelIdPattern", e.target.value)}
                className="input w-full font-mono text-sm" placeholder="gpt-* or % for all" />
              <p className="mt-1 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>% = any model, gpt-* = all GPT models</p>
            </div>

            {/* Priority */}
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Priority</label>
              <input type="number" value={form.priority ?? 100} onChange={(e) => set("priority", parseInt(e.target.value))}
                className="input w-full" min={1} max={999} />
              <p className="mt-1 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>Lower number = evaluated first</p>
            </div>

            {/* User role pattern */}
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>User role pattern</label>
              <input value={form.userRolePattern ?? ""} onChange={(e) => set("userRolePattern", e.target.value)}
                className="input w-full font-mono text-sm" placeholder="admin|compliance (optional)" />
            </div>

            {/* Fallback model */}
            {form.action === "route_fallback" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Fallback model ID</label>
                <input value={form.fallbackModelId ?? ""} onChange={(e) => set("fallbackModelId", e.target.value)}
                  className="input w-full font-mono text-sm" placeholder="gpt-4o-mini" />
              </div>
            )}
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-6 rounded-xl px-4 py-3"
            style={{ background: "hsl(var(--accent))" }}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={form.requireHumanApproval ?? false}
                onChange={(e) => set("requireHumanApproval", e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-600" />
              <span style={{ color: "hsl(var(--muted-foreground))" }}>Require human approval</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={form.enabled ?? true}
                onChange={(e) => set("enabled", e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-600" />
              <span style={{ color: "hsl(var(--muted-foreground))" }}>Enabled</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4"
          style={{ borderColor: "hsl(var(--border))" }}>
          <button type="button" onClick={onClose} className="md-btn-outlined text-sm px-4 py-2">Cancel</button>
          <button type="submit" disabled={saving} className="md-btn-filled text-sm px-4 py-2 flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create policy"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [modalTarget, setModalTarget] = useState<Partial<Policy> | null>(null);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterClass, setFilterClass] = useState("all");
  const [filterEnabled, setFilterEnabled] = useState("all");

  async function load() {
    const data = await loadGovernanceData(
      () => fetch("/api/governance/policies").then((r) => r.json()),
      {
        isEmpty: (d) => !(d.policies ?? []).length,
        onFirst: (d) => {
          setPolicies(d.policies ?? []);
          setLoading(false);
        },
      },
    );
    setPolicies(data.policies ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function seedDefaults() {
    setSeeding(true);
    await fetch("/api/governance/policies/seed-defaults", { method: "POST" });
    await load();
    setSeeding(false);
  }

  async function deletePolicy(id: string) {
    if (!confirm("Delete this policy? This cannot be undone.")) return;
    await fetch(`/api/governance/policies/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleEnabled(p: Policy) {
    await fetch(`/api/governance/policies/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !p.enabled }),
    });
    load();
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: policies.length,
    active: policies.filter((p) => p.enabled).length,
    allow: policies.filter((p) => p.action === "allow").length,
    deny: policies.filter((p) => p.action === "deny").length,
    approval: policies.filter((p) => p.action === "require_approval").length,
  }), [policies]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return policies.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.description ?? "").toLowerCase().includes(q) && !(p.modelIdPattern ?? "").toLowerCase().includes(q)) return false;
      if (filterAction !== "all" && p.action !== filterAction) return false;
      if (filterClass !== "all" && p.dataClass !== filterClass) return false;
      if (filterEnabled === "enabled" && !p.enabled) return false;
      if (filterEnabled === "disabled" && p.enabled) return false;
      return true;
    });
  }, [policies, search, filterAction, filterClass, filterEnabled]);

  const hasActiveFilters = search || filterAction !== "all" || filterClass !== "all" || filterEnabled !== "all";

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Policies"
        description="These rules run on every /v1/chat/completions call before a provider is reached. Use * for all models, or globs like gpt-*|claude-*."
        actions={
          <button onClick={() => setModalTarget(BLANK)} className="md-btn-filled shrink-0 flex items-center gap-2 px-4 py-2">
            <Plus className="h-4 w-4" /> New policy
          </button>
        }
      />

      {/* Stats */}
      {policies.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total",    value: stats.total,    color: "hsl(var(--foreground))" },
            { label: "Active",   value: stats.active,   color: "hsl(var(--foreground))" },
            { label: "Allow",    value: stats.allow,    color: "var(--green)" },
            { label: "Deny",     value: stats.deny,     color: "var(--red)" },
            { label: "Approval", value: stats.approval, color: "var(--yellow)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-4 text-center">
              <p className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</p>
              <p className="mt-0.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {policies.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-5 py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "hsl(var(--accent))" }}>
            <Shield className="h-7 w-7" style={{ color: "hsl(var(--muted-foreground))" }} />
          </div>
          <div>
            <p className="text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>No policies yet</p>
            <p className="mt-1 max-w-sm text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Policies control which models can process which data classes. Start with baseline defaults or create your own.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={seedDefaults}
              disabled={seeding}
              className="md-btn-tonal flex items-center gap-2 px-5 py-2 text-sm"
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              Load baseline defaults
            </button>
            <button onClick={() => setModalTarget(BLANK)} className="md-btn-filled flex items-center gap-2 px-5 py-2 text-sm">
              <Plus className="h-4 w-4" /> Create policy
            </button>
          </div>
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Apply a Sector Pack to write a set of live gateway rules for that industry.
          </p>
        </div>
      ) : (
        <>
          {/* Filter bar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search policies…" className="input w-full pl-8 text-sm" />
            </div>
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="input w-auto text-sm">
              <option value="all">All actions</option>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="require_approval">Require Approval</option>
              <option value="route_fallback">Route Fallback</option>
            </select>
            <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="input w-auto text-sm">
              <option value="all">All data classes</option>
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
            </select>
            <select value={filterEnabled} onChange={(e) => setFilterEnabled(e.target.value)} className="input w-auto text-sm">
              <option value="all">All statuses</option>
              <option value="enabled">Enabled only</option>
              <option value="disabled">Disabled only</option>
            </select>
            {hasActiveFilters && (
              <button onClick={() => { setSearch(""); setFilterAction("all"); setFilterClass("all"); setFilterEnabled("all"); }}
                className="flex items-center gap-1 text-xs md-btn-text px-2 py-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
            <span className="ml-auto text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              {filtered.length} of {policies.length}
            </span>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                  <th className="table-header-cell text-left" style={{ width: "35%" }}>Policy</th>
                  <th className="table-header-cell text-left">Data class</th>
                  <th className="table-header-cell text-left">Action</th>
                  <th className="table-header-cell text-left">Model pattern</th>
                  <th className="table-header-cell text-right" style={{ width: "60px" }}>Priority</th>
                  <th className="table-header-cell text-center" style={{ width: "80px" }}>Status</th>
                  <th className="table-header-cell text-right" style={{ width: "80px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                      No policies match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="transition-colors"
                      style={{ borderBottom: "1px solid hsl(var(--border))", opacity: p.enabled ? 1 : 0.55 }}>
                      <td className="table-cell">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{p.name}</span>
                            <SourceBadge metadata={p.metadata} />
                          </div>
                          {p.description && (
                            <span className="text-xs leading-snug" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {p.description.length > 80 ? p.description.slice(0, 80) + "…" : p.description}
                            </span>
                          )}
                          {p.requireHumanApproval && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ background: "var(--yellow-soft)", color: "var(--yellow)" }}>
                              <ShieldAlert className="h-2.5 w-2.5" /> Human review
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">
                        <DataClassBadge cls={p.dataClass} />
                      </td>
                      <td className="table-cell">
                        <ActionBadge action={p.action} />
                      </td>
                      <td className="table-cell">
                        {p.modelIdPattern ? (
                          <code className="rounded px-1.5 py-0.5 text-xs"
                            style={{ background: "hsl(var(--accent))", color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>
                            {p.modelIdPattern}
                          </code>
                        ) : (
                          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>any</span>
                        )}
                      </td>
                      <td className="table-cell text-right tabular-nums text-sm"
                        style={{ color: "hsl(var(--muted-foreground))" }}>
                        {p.priority}
                      </td>
                      <td className="table-cell text-center">
                        <button onClick={() => toggleEnabled(p)} title={p.enabled ? "Disable" : "Enable"}>
                          {p.enabled
                            ? <CheckCircle2 className="mx-auto h-5 w-5" style={{ color: "var(--green)" }} />
                            : <XCircle className="mx-auto h-5 w-5" style={{ color: "hsl(var(--muted-foreground))" }} />}
                        </button>
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setModalTarget(p)} className="md-icon-btn h-8 w-8"
                            title="Edit" aria-label="Edit policy">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deletePolicy(p.id)} className="md-icon-btn h-8 w-8"
                            title="Delete" aria-label="Delete policy"
                            style={{ color: "var(--red)" }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Data class legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Data classes:</span>
            {Object.entries(DATA_CLASS_STYLE).map(([cls, s]) => (
              <span key={cls} className="flex items-center gap-1.5 text-xs capitalize" style={{ color: "hsl(var(--muted-foreground))" }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {cls}
              </span>
            ))}
            <span className="ml-auto text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Lower priority number = evaluated first
            </span>
          </div>
        </>
      )}

      {/* Create / Edit modal */}
      {modalTarget && (
        <PolicyModal
          initial={modalTarget}
          onClose={() => setModalTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
