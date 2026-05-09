"use client";

import { useEffect, useState, useMemo } from "react";
import {
  CheckCircle2, XCircle, Loader2, Clock, Search,
  Shield, ShieldCheck, AlertTriangle, Cpu, RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface GovernanceModel {
  id: string;
  modelId: string;
  displayName: string;
  description: string | null;
  approvalStatus: string;
  riskLevel: string;
  businessLabels: string[];
  allowedUseCases: string[];
  bannedUseCases: string[];
  dataClassesAllowed: string[];
  costTier: string;
  allowedRegions: string[];
  provenanceVerified: boolean;
  biasReviewed: boolean;
  safetyReviewed: boolean;
  sectorTags: string[];
  licenseType: string | null;
  contextWindow: number | null;
}

interface Approval {
  id: string;
  modelGovernanceId: string;
  status: string;
  reviewNotes: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  model: GovernanceModel;
}

type Tab = "queue" | "request";

// ── Style maps ───────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: "var(--yellow-soft)", color: "var(--yellow)", label: "Pending" },
  in_review: { bg: "#FEF3C7",            color: "#D97706",       label: "In Review" },
  approved:  { bg: "var(--green-soft)",  color: "var(--green)",  label: "Approved" },
  rejected:  { bg: "var(--red-soft)",    color: "var(--red)",    label: "Rejected" },
};

const RISK_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  low:      { bg: "var(--green-soft)",  color: "var(--green)",  dot: "var(--green)"  },
  medium:   { bg: "var(--yellow-soft)", color: "var(--yellow)", dot: "var(--yellow)" },
  high:     { bg: "#FEE2E2",            color: "#B91C1C",       dot: "#B91C1C"       },
  critical: { bg: "var(--red-soft)",    color: "var(--red)",    dot: "var(--red)"    },
};

const DATA_CLASS_STYLE: Record<string, { bg: string; color: string }> = {
  public:       { bg: "#E9EBF2", color: "#43474E" },
  internal:     { bg: "#D3E4FD", color: "#1A73E8" },
  confidential: { bg: "#FFEFC2", color: "#7A5700" },
  restricted:   { bg: "#F9DEDC", color: "#B3261E" },
};

// ── Small helpers ────────────────────────────────────────────────────────────

function Dot({ risk }: { risk: string }) {
  const s = RISK_STYLE[risk] ?? RISK_STYLE.medium;
  return (
    <span className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: s.dot, boxShadow: `0 0 0 3px ${s.bg}` }} />
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const s = RISK_STYLE[risk] ?? RISK_STYLE.medium;
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
      style={{ background: s.bg, color: s.color }}>
      {risk} risk
    </span>
  );
}

function DataClassBadge({ cls }: { cls: string }) {
  const s = DATA_CLASS_STYLE[cls] ?? { bg: "var(--paper-3)", color: "var(--ink-2)" };
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{ background: s.bg, color: s.color }}>
      {cls}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Approval card ────────────────────────────────────────────────────────────

function ApprovalCard({
  approval,
  notes,
  onNotesChange,
  onReview,
}: {
  approval: Approval;
  notes: string;
  onNotesChange: (v: string) => void;
  onReview: (status: string) => void;
}) {
  const m = approval.model;
  const isPending = approval.status === "pending" || approval.status === "in_review";

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4"
        style={{ borderColor: "var(--line-soft)" }}>
        <Dot risk={m.riskLevel} />
        <h3 className="text-base font-semibold" style={{ color: "var(--ink)" }}>
          {m.displayName}
        </h3>
        <StatusBadge status={approval.status} />
        <RiskBadge risk={m.riskLevel} />
        <span className="ml-auto text-xs" style={{ color: "var(--ink-4)" }}>
          {timeAgo(approval.requestedAt)}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Model meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--ink-3)" }}>
          <span>Model: <code className="rounded px-1 py-0.5 text-[11px]"
            style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}>{m.modelId}</code></span>
          {m.costTier && <span>Cost: <strong className="capitalize">{m.costTier}</strong></span>}
          {m.contextWindow && <span>Context: <strong>{(m.contextWindow / 1000).toFixed(0)}k tokens</strong></span>}
          {m.licenseType && <span>Licence: <strong>{m.licenseType}</strong></span>}
        </div>

        {m.description && (
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>{m.description}</p>
        )}

        {/* Business labels */}
        {m.businessLabels?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.businessLabels.map((l) => (
              <span key={l} className="rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}>
                {l}
              </span>
            ))}
          </div>
        )}

        {/* Data classes */}
        {m.dataClassesAllowed?.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>
              Data classes
            </p>
            <div className="flex flex-wrap gap-1">
              {m.dataClassesAllowed.map((c) => <DataClassBadge key={c} cls={c} />)}
            </div>
          </div>
        )}

        {/* Use cases */}
        {(m.allowedUseCases?.length > 0 || m.bannedUseCases?.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {m.allowedUseCases?.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>
                  Allowed uses
                </p>
                <ul className="space-y-0.5">
                  {m.allowedUseCases.slice(0, 3).map((u) => (
                    <li key={u} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-2)" }}>
                      <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: "var(--green)" }} />
                      {u}
                    </li>
                  ))}
                  {m.allowedUseCases.length > 3 && (
                    <li className="text-xs" style={{ color: "var(--ink-4)" }}>+{m.allowedUseCases.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
            {m.bannedUseCases?.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>
                  Banned uses
                </p>
                <ul className="space-y-0.5">
                  {m.bannedUseCases.slice(0, 3).map((u) => (
                    <li key={u} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-2)" }}>
                      <XCircle className="h-3 w-3 shrink-0" style={{ color: "var(--red)" }} />
                      {u}
                    </li>
                  ))}
                  {m.bannedUseCases.length > 3 && (
                    <li className="text-xs" style={{ color: "var(--ink-4)" }}>+{m.bannedUseCases.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Existing review notes (if already reviewed) */}
        {!isPending && approval.reviewNotes && (
          <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--paper-3)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>Review notes</p>
            <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>{approval.reviewNotes}</p>
            {approval.reviewedAt && (
              <p className="mt-1 text-[11px]" style={{ color: "var(--ink-4)" }}>
                Reviewed {timeAgo(approval.reviewedAt)}
              </p>
            )}
          </div>
        )}

        {/* Review actions */}
        {isPending && (
          <div className="border-t pt-4" style={{ borderColor: "var(--line-soft)" }}>
            <textarea
              placeholder="Add review notes (optional)…"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="input w-full mb-3"
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => onReview("rejected")}
                className="md-btn-outlined flex items-center gap-1.5 px-4 py-2 text-sm"
                style={{ color: "var(--red)", borderColor: "var(--red)" }}
              >
                <XCircle className="h-4 w-4" /> Reject
              </button>
              <button
                onClick={() => onReview("approved")}
                className="md-btn-filled flex items-center gap-1.5 px-4 py-2 text-sm"
                style={{ background: "var(--green)" }}
              >
                <CheckCircle2 className="h-4 w-4" /> Approve
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Model catalogue card ─────────────────────────────────────────────────────

function ModelCatalogueCard({
  model,
  existingApproval,
  requesting,
  onRequest,
}: {
  model: GovernanceModel;
  existingApproval: Approval | undefined;
  requesting: boolean;
  onRequest: () => void;
}) {
  const rk = RISK_STYLE[model.riskLevel] ?? RISK_STYLE.medium;

  const statusEl = () => {
    if (requesting) {
      return (
        <button disabled className="md-btn-tonal flex items-center gap-2 px-4 py-2 text-sm opacity-70">
          <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
        </button>
      );
    }
    if (!existingApproval) {
      return (
        <button onClick={onRequest} className="md-btn-filled flex items-center gap-2 px-4 py-2 text-sm">
          <ShieldCheck className="h-4 w-4" /> Request Access
        </button>
      );
    }
    if (existingApproval.status === "pending" || existingApproval.status === "in_review") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
          style={{ background: "var(--yellow-soft)", color: "var(--yellow)" }}>
          <Clock className="h-3.5 w-3.5" /> Pending review…
        </span>
      );
    }
    if (existingApproval.status === "approved") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
          style={{ background: "var(--green-soft)", color: "var(--green)" }}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Approved
        </span>
      );
    }
    if (existingApproval.status === "rejected") {
      return (
        <button onClick={onRequest} className="md-btn-outlined flex items-center gap-2 px-4 py-2 text-sm"
          style={{ color: "var(--red)", borderColor: "var(--red)" }}>
          <RefreshCw className="h-3.5 w-3.5" /> Request Again
        </button>
      );
    }
    return null;
  };

  return (
    <div className="card flex flex-col overflow-hidden od-lift">
      {/* Header strip */}
      <div className="flex items-center gap-2.5 border-b px-5 py-3.5"
        style={{ borderColor: "var(--line-soft)", background: rk.bg }}>
        <Dot risk={model.riskLevel} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>
            {model.displayName}
          </p>
          <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            <code>{model.modelId}</code>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <RiskBadge risk={model.riskLevel} />
          {model.costTier && (
            <span className="text-[10px] font-medium capitalize" style={{ color: rk.color }}>
              {model.costTier}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 space-y-3">
        {model.description && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {model.description.length > 120 ? model.description.slice(0, 120) + "…" : model.description}
          </p>
        )}

        {/* Labels */}
        {model.businessLabels?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {model.businessLabels.map((l) => (
              <span key={l} className="rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}>
                {l}
              </span>
            ))}
          </div>
        )}

        {/* Data classes */}
        {model.dataClassesAllowed?.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>
              Data classes
            </p>
            <div className="flex flex-wrap gap-1">
              {model.dataClassesAllowed.map((c) => <DataClassBadge key={c} cls={c} />)}
            </div>
          </div>
        )}

        {/* Verifications */}
        <div className="flex flex-wrap gap-3">
          {[
            { ok: model.provenanceVerified, label: "Provenance" },
            { ok: model.biasReviewed,       label: "Bias audit" },
            { ok: model.safetyReviewed,     label: "Safety" },
          ].map(({ ok, label }) => (
            <span key={label} className="flex items-center gap-1 text-[11px]"
              style={{ color: ok ? "var(--green)" : "var(--ink-4)" }}>
              {ok
                ? <CheckCircle2 className="h-3 w-3" />
                : <XCircle className="h-3 w-3" />}
              {label}
            </span>
          ))}
          {model.allowedRegions?.length > 0 && (
            <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
              {model.allowedRegions.join(" · ").toUpperCase()}
            </span>
          )}
        </div>

        {/* Spacer + CTA */}
        <div className="mt-auto pt-2">
          {statusEl()}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [models, setModels] = useState<GovernanceModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("queue");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [search, setSearch] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState<string | null>(null);

  async function load() {
    const [aRes, mRes] = await Promise.all([
      fetch("/api/governance/approvals"),
      fetch("/api/governance/models"),
    ]);
    const [aData, mData] = await Promise.all([aRes.json(), mRes.json()]);
    setApprovals(aData.approvals ?? []);
    setModels(mData.models ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function reviewApproval(id: string, status: string) {
    await fetch(`/api/governance/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNotes: reviewNotes[id] ?? "" }),
    });
    setReviewNotes((p) => { const n = { ...p }; delete n[id]; return n; });
    load();
  }

  async function requestAccess(modelGovernanceId: string) {
    setRequesting(modelGovernanceId);
    await fetch("/api/governance/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelGovernanceId }),
    });
    await load();
    setRequesting(null);
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const approvalsByModelId = useMemo(
    () => new Map(approvals.map((a) => [a.modelGovernanceId, a])),
    [approvals]
  );

  const stats = useMemo(() => ({
    pending:  approvals.filter((a) => a.status === "pending").length,
    inReview: approvals.filter((a) => a.status === "in_review").length,
    approved: approvals.filter((a) => a.status === "approved").length,
    rejected: approvals.filter((a) => a.status === "rejected").length,
  }), [approvals]);

  const filteredApprovals = useMemo(() => {
    return approvals.filter((a) => {
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (filterRisk !== "all" && a.model?.riskLevel !== filterRisk) return false;
      return true;
    });
  }, [approvals, filterStatus, filterRisk]);

  const filteredModels = useMemo(() => {
    const q = search.toLowerCase();
    return models.filter((m) => {
      if (filterRisk !== "all" && m.riskLevel !== filterRisk) return false;
      if (q && !m.displayName.toLowerCase().includes(q) &&
        !m.modelId.toLowerCase().includes(q) &&
        !(m.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [models, filterRisk, search]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "queue",   label: "Review Queue", count: stats.pending + stats.inReview },
    { id: "request", label: "Request Access" },
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="page-title">Approvals</h1>
        <p className="page-desc">Request access to LLMs for your organisation, and review pending approval requests.</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Pending",   value: stats.pending,  color: "var(--yellow)" },
          { label: "In Review", value: stats.inReview, color: "#D97706" },
          { label: "Approved",  value: stats.approved, color: "var(--green)" },
          { label: "Rejected",  value: stats.rejected, color: "var(--red)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--ink-4)" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: tab === t.id ? "var(--ink)" : "var(--ink-4)",
              borderBottom: tab === t.id ? "2px solid var(--ink)" : "2px solid transparent",
              marginBottom: "-1px", background: "transparent", cursor: "pointer",
            }}>
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums"
                style={{ background: "var(--yellow-soft)", color: "var(--yellow)" }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── REVIEW QUEUE TAB ── */}
      {tab === "queue" && (
        <div className="space-y-4">
          {/* Filters */}
          {approvals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="input w-auto text-sm">
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="in_review">In Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}
                className="input w-auto text-sm">
                <option value="all">All risk levels</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <span className="self-center ml-auto text-xs" style={{ color: "var(--ink-4)" }}>
                {filteredApprovals.length} of {approvals.length}
              </span>
            </div>
          )}

          {/* Empty state */}
          {approvals.length === 0 ? (
            <div className="card flex flex-col items-center justify-center gap-5 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: "var(--paper-3)" }}>
                <Shield className="h-7 w-7" style={{ color: "var(--ink-3)" }} />
              </div>
              <div>
                <p className="text-base font-semibold" style={{ color: "var(--ink)" }}>
                  No approval requests yet
                </p>
                <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--ink-3)" }}>
                  Switch to Request Access to browse available models and submit your first access request.
                </p>
              </div>
              <button onClick={() => setTab("request")}
                className="md-btn-filled flex items-center gap-2 px-5 py-2 text-sm">
                <Cpu className="h-4 w-4" /> Browse Models
              </button>
            </div>
          ) : filteredApprovals.length === 0 ? (
            <div className="card flex h-32 items-center justify-center text-sm"
              style={{ color: "var(--ink-3)" }}>
              No approvals match the current filter.
            </div>
          ) : (
            filteredApprovals.map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                notes={reviewNotes[a.id] ?? ""}
                onNotesChange={(v) => setReviewNotes((p) => ({ ...p, [a.id]: v }))}
                onReview={(status) => reviewApproval(a.id, status)}
              />
            ))
          )}
        </div>
      )}

      {/* ── REQUEST ACCESS TAB ── */}
      {tab === "request" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: "var(--ink-4)" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models…" className="input w-full pl-8 text-sm" />
            </div>
            <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}
              className="input w-auto text-sm">
              <option value="all">All risk levels</option>
              <option value="low">Low risk</option>
              <option value="medium">Medium risk</option>
              <option value="high">High risk</option>
              <option value="critical">Critical risk</option>
            </select>
            <span className="text-xs" style={{ color: "var(--ink-4)" }}>
              {filteredModels.length} model{filteredModels.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Model catalogue */}
          {models.length === 0 ? (
            <div className="card flex flex-col items-center justify-center gap-4 py-16 text-center">
              <AlertTriangle className="h-8 w-8" style={{ color: "var(--ink-4)" }} />
              <div>
                <p className="font-medium" style={{ color: "var(--ink)" }}>Model registry is empty</p>
                <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                  Run the enterprise governance seed script to populate the model catalogue.
                </p>
              </div>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="card flex h-32 items-center justify-center text-sm"
              style={{ color: "var(--ink-3)" }}>
              No models match the current search or filters.
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {filteredModels.map((m) => (
                <ModelCatalogueCard
                  key={m.id}
                  model={m}
                  existingApproval={approvalsByModelId.get(m.id)}
                  requesting={requesting === m.id}
                  onRequest={() => requestAccess(m.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
