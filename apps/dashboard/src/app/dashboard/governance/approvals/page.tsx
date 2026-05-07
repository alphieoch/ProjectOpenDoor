"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Approval {
  id: string;
  modelGovernanceId: string;
  status: string;
  reviewNotes: string;
  requestedAt: string;
  reviewedAt: string;
  model: { id: string; modelId: string; displayName: string; riskLevel: string; approvalStatus: string };
}

const statusStyle: Record<string, { bg: string; color: string }> = {
  approved: { bg: "var(--green-soft)",  color: "var(--green)"  },
  rejected: { bg: "var(--red-soft)",    color: "var(--red)"    },
  pending:  { bg: "var(--yellow-soft)", color: "var(--yellow)" },
};

const riskStyle: Record<string, { bg: string; color: string }> = {
  low:      { bg: "var(--green-soft)",  color: "var(--green)"  },
  medium:   { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  high:     { bg: "#FEE2E2",            color: "#B91C1C"       },
  critical: { bg: "var(--red-soft)",    color: "var(--red)"    },
};

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  useEffect(() => { loadApprovals(); }, [filterStatus]);

  async function loadApprovals() {
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    const res = await fetch(`/api/governance/approvals?${params.toString()}`);
    const data = await res.json();
    setApprovals(data.approvals || []);
    setLoading(false);
  }

  async function reviewApproval(id: string, status: string) {
    await fetch(`/api/governance/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNotes: reviewNotes[id] || "" }),
    });
    setReviewNotes((p) => ({ ...p, [id]: "" }));
    loadApprovals();
  }

  const stats = {
    pending:  approvals.filter((a) => a.status === "pending").length,
    approved: approvals.filter((a) => a.status === "approved").length,
    rejected: approvals.filter((a) => a.status === "rejected").length,
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Approvals</h1>
        <p className="page-desc">Review and approve models before they can be used in production.</p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Pending",  value: stats.pending,  color: "var(--yellow)" },
              { label: "Approved", value: stats.approved, color: "var(--green)"  },
              { label: "Rejected", value: stats.rejected, color: "var(--red)"    },
            ].map((s) => (
              <div key={s.label} className="card p-4">
                <div className="text-xs" style={{ color: "var(--ink-3)" }}>{s.label}</div>
                <div className="mt-1 text-2xl font-semibold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-auto">
            {[["all","All statuses"],["pending","Pending"],["approved","Approved"],["rejected","Rejected"]].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          {/* Cards */}
          {approvals.length === 0 ? (
            <div className="card flex h-40 items-center justify-center" style={{ color: "var(--ink-3)" }}>
              No approvals match the current filter.
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map((a) => {
                const st = statusStyle[a.status] ?? statusStyle.pending;
                const rk = riskStyle[a.model?.riskLevel] ?? { bg: "var(--paper-3)", color: "var(--ink-2)" };
                return (
                  <div key={a.id} className="card p-5">
                    <div className="flex items-start justify-between gap-6">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold" style={{ color: "var(--ink)" }}>{a.model?.displayName}</h3>
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                            style={{ background: st.bg, color: st.color }}>{a.status}</span>
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                            style={{ background: rk.bg, color: rk.color }}>{a.model?.riskLevel} risk</span>
                        </div>
                        <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                          Model ID: {a.model?.modelId} · Requested {new Date(a.requestedAt).toLocaleString()}
                        </p>
                        {a.reviewNotes && (
                          <div className="mt-2 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}>
                            <span className="font-medium">Review notes: </span>{a.reviewNotes}
                          </div>
                        )}
                      </div>

                      {a.status === "pending" && (
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <textarea
                            placeholder="Add review notes…"
                            value={reviewNotes[a.id] || ""}
                            onChange={(e) => setReviewNotes((p) => ({ ...p, [a.id]: e.target.value }))}
                            className="input w-60"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => reviewApproval(a.id, "approved")}
                              className="btn-sm inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-white"
                              style={{ background: "var(--green)" }}
                            >
                              <CheckCircle2 className="h-4 w-4" /> Approve
                            </button>
                            <button
                              onClick={() => reviewApproval(a.id, "rejected")}
                              className="btn-sm inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-white"
                              style={{ background: "var(--red)" }}
                            >
                              <XCircle className="h-4 w-4" /> Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
