"use client";

import { useEffect, useState } from "react";
import {
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
} from "lucide-react";

interface Approval {
  id: string;
  modelGovernanceId: string;
  status: string;
  reviewNotes: string;
  requestedAt: string;
  reviewedAt: string;
  model: {
    id: string;
    modelId: string;
    displayName: string;
    riskLevel: string;
    approvalStatus: string;
  };
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    loadApprovals();
  }, [filterStatus]);

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
    setReviewNotes((prev) => ({ ...prev, [id]: "" }));
    loadApprovals();
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  const stats = {
    pending: approvals.filter((a) => a.status === "pending").length,
    approved: approvals.filter((a) => a.status === "approved").length,
    rejected: approvals.filter((a) => a.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Approval Workflows</h1>
        <p className="text-sm text-gray-500">Review and approve models before they can be used in production.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Pending</div>
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Approved</div>
          <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Rejected</div>
          <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
        </div>
      </div>

      <div className="flex gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="space-y-4">
        {approvals.map((a) => (
          <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-gray-900">{a.model.displayName}</h3>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    a.status === "approved" ? "bg-green-100 text-green-800" :
                    a.status === "rejected" ? "bg-red-100 text-red-800" :
                    "bg-amber-100 text-amber-800"
                  }`}>
                    {a.status.replace("_", " ")}
                  </span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    a.model.riskLevel === "low" ? "bg-green-100 text-green-800" :
                    a.model.riskLevel === "medium" ? "bg-amber-100 text-amber-800" :
                    a.model.riskLevel === "high" ? "bg-orange-100 text-orange-800" :
                    "bg-red-100 text-red-800"
                  }`}>
                    {a.model.riskLevel} risk
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">Model ID: {a.model.modelId}</p>
                <p className="text-xs text-gray-400">Requested {new Date(a.requestedAt).toLocaleString()}</p>
                {a.reviewNotes && (
                  <div className="mt-2 rounded-md bg-gray-50 p-2 text-sm text-gray-700">
                    <span className="font-medium">Review notes:</span> {a.reviewNotes}
                  </div>
                )}
              </div>

              {a.status === "pending" && (
                <div className="ml-4 flex flex-col items-end gap-2">
                  <textarea
                    placeholder="Add review notes..."
                    value={reviewNotes[a.id] || ""}
                    onChange={(e) => setReviewNotes((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => reviewApproval(a.id, "approved")}
                      className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </button>
                    <button
                      onClick={() => reviewApproval(a.id, "rejected")}
                      className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
