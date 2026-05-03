"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronRight,
  Search,
  Users,
  Globe,
  Star,
} from "lucide-react";

interface GovernanceModel {
  id: string;
  modelId: string;
  displayName: string;
  description: string;
  approvalStatus: string;
  riskLevel: string;
  businessLabels: string[];
  allowedUseCases: string[];
  bannedUseCases: string[];
  dataClassesAllowed: string[];
  licenseType: string;
  provenanceVerified: boolean;
  biasReviewed: boolean;
  safetyReviewed: boolean;
  contextWindow: number;
  parameterScale: string;
  costTier: string;
  sectorTags: string[];
  ownerTeam?: string;
  businessCriticality?: string;
  allowedRegions?: string[];
  lastReviewedByName?: string | null;
  lastReviewedAt?: string;
  latestEvaluations: Array<{
    id: string;
    evaluationName: string;
    evaluationType: string;
    passed: boolean;
    score: string;
  }>;
  complianceSummary: Record<string, { total: number; compliant: number; partial: number; nonCompliant: number }>;
  recentViolations: Array<{ id: string; violationType: string; severity: string; createdAt: string }>;
  pendingApproval: { id: string; status: string } | null;
}

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const statusIcons: Record<string, React.ReactNode> = {
  approved: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  pending: <Clock className="h-4 w-4 text-amber-600" />,
  in_review: <Clock className="h-4 w-4 text-blue-600" />,
  rejected: <XCircle className="h-4 w-4 text-red-600" />,
  deprecated: <AlertTriangle className="h-4 w-4 text-gray-600" />,
};

export default function TrustCenterPage() {
  const [models, setModels] = useState<GovernanceModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");

  useEffect(() => {
    fetch("/api/governance/trust-center")
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = models.filter((m) => {
    const matchesSearch =
      !search ||
      m.displayName.toLowerCase().includes(search.toLowerCase()) ||
      m.modelId.toLowerCase().includes(search.toLowerCase()) ||
      m.ownerTeam?.toLowerCase().includes(search.toLowerCase()) ||
      m.businessLabels?.some((l) => l.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = filterStatus === "all" || m.approvalStatus === filterStatus;
    const matchesRisk = filterRisk === "all" || m.riskLevel === filterRisk;
    return matchesSearch && matchesStatus && matchesRisk;
  });

  const stats = {
    total: models.length,
    approved: models.filter((m) => m.approvalStatus === "approved").length,
    pending: models.filter((m) => m.approvalStatus === "pending" || m.approvalStatus === "in_review").length,
    highRisk: models.filter((m) => m.riskLevel === "high" || m.riskLevel === "critical").length,
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trust Center</h1>
        <p className="text-sm text-gray-500">
          Hugging Face helps you find and host models; this platform governs how your business is allowed to use them.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Total Models</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Approved</div>
          <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Pending Review</div>
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">High / Critical Risk</div>
          <div className="text-2xl font-bold text-red-600">{stats.highRisk}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search models, labels, teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="in_review">In Review</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filterRisk}
          onChange={(e) => setFilterRisk(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">All Risks</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Model Cards */}
      <div className="space-y-4">
        {filtered.map((model) => (
          <div
            key={model.id}
            className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-semibold text-gray-900">{model.displayName}</h3>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${riskColors[model.riskLevel] || "bg-gray-100 text-gray-800"}`}>
                    {model.riskLevel.toUpperCase()} RISK
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {statusIcons[model.approvalStatus]}
                    {model.approvalStatus.replace("_", " ")}
                  </span>
                  {model.pendingApproval && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      <Clock className="h-3 w-3" /> Approval requested
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">{model.description}</p>

                {/* Owner & Review */}
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                  {model.ownerTeam && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> Owner: {model.ownerTeam}
                    </span>
                  )}
                  {model.businessCriticality && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3" /> {model.businessCriticality}
                    </span>
                  )}
                  {model.allowedRegions && model.allowedRegions.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="h-3 w-3" /> Regions: {model.allowedRegions.join(", ")}
                    </span>
                  )}
                  {model.lastReviewedByName && (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> Last reviewed by {model.lastReviewedByName}
                      {model.lastReviewedAt && ` · ${new Date(model.lastReviewedAt).toLocaleDateString()}`}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {model.businessLabels?.map((label) => (
                    <span key={label} className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                      {label}
                    </span>
                  ))}
                  {model.sectorTags?.map((tag) => (
                    <span key={tag} className="rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase">Allowed Data</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {model.dataClassesAllowed?.map((dc) => (
                        <span key={dc} className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">{dc}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase">License</div>
                    <div className="mt-1 text-sm text-gray-700">{model.licenseType || "Unknown"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase">Context Window</div>
                    <div className="mt-1 text-sm text-gray-700">{model.contextWindow?.toLocaleString() || "N/A"}</div>
                  </div>
                </div>

                {model.latestEvaluations && model.latestEvaluations.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-medium text-gray-500 uppercase">Latest Evaluations</div>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {model.latestEvaluations.map((ev) => (
                        <div key={ev.id} className="flex items-center gap-1.5 text-sm">
                          {ev.passed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-gray-700">{ev.evaluationName}</span>
                          <span className="text-gray-400">{ev.score}{ev.score ? "%" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {model.complianceSummary && Object.keys(model.complianceSummary).length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-medium text-gray-500 uppercase">Compliance</div>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {Object.entries(model.complianceSummary).map(([framework, counts]) => (
                        <div key={framework} className="text-sm">
                          <span className="font-medium text-gray-700 uppercase">{framework.replace("_", " ")}:</span>{" "}
                          <span className="text-green-600">{counts.compliant}/{counts.total}</span>
                          {counts.partial > 0 && <span className="text-amber-600"> · {counts.partial} partial</span>}
                          {counts.nonCompliant > 0 && <span className="text-red-600"> · {counts.nonCompliant} non-compliant</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {model.recentViolations && model.recentViolations.length > 0 && (
                  <div className="mt-3 rounded-md bg-red-50 p-2">
                    <div className="text-xs font-medium text-red-700 uppercase">Recent Violations</div>
                    <div className="mt-1 space-y-1">
                      {model.recentViolations.map((v) => (
                        <div key={v.id} className="text-xs text-red-600">
                          {v.violationType} · {v.severity} · {new Date(v.createdAt).toLocaleDateString()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Link
                href={`/dashboard/governance/models/${model.id}`}
                className="ml-4 flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Details <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
