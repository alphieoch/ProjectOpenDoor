"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { loadGovernanceData } from "@/lib/governance/ensure-client";

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
  licenseType: string | null;
  provenanceVerified: boolean;
  biasReviewed: boolean;
  safetyReviewed: boolean;
  contextWindow: number | null;
  costTier: string | null;
  sectorTags: string[];
  ownerTeam: string | null;
  businessCriticality: string | null;
  allowedRegions: string[];
}

interface Evaluation {
  id: string;
  evaluationName: string;
  evaluationType: string;
  score: string | null;
  passed: boolean | null;
  evaluatedAt: string;
}

interface Mapping {
  mappingId: string;
  controlId: string;
  framework: string;
  controlCode: string;
  controlName: string;
  requirementLevel: string;
  status: string;
  evidence: string | null;
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  approved: { bg: "var(--green-soft)", color: "var(--green)" },
  pending: { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  in_review: { bg: "#DBEAFE", color: "#1565C0" },
  rejected: { bg: "var(--red-soft)", color: "var(--red)" },
  deprecated: { bg: "hsl(var(--accent))", color: "hsl(var(--muted-foreground))" },
};

const RISK_STYLE: Record<string, { bg: string; color: string }> = {
  low: { bg: "var(--green-soft)", color: "var(--green)" },
  medium: { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  high: { bg: "#FEE2E2", color: "#B91C1C" },
  critical: { bg: "var(--red-soft)", color: "var(--red)" },
};

export default function GovernanceModelPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [model, setModel] = useState<GovernanceModel | null>(null);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [compliance, setCompliance] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function load() {
    const data = await loadGovernanceData(async () => {
      const [mRes, eRes, cRes] = await Promise.all([
        fetch(`/api/governance/models/${params.id}`),
        fetch(`/api/governance/models/${params.id}/evaluations`),
        fetch(`/api/governance/models/${params.id}/compliance`),
      ]);
      return {
        model: (await mRes.json()).model ?? null,
        evaluations: (await eRes.json()).evaluations ?? [],
        compliance: (await cRes.json()).compliance ?? [],
      };
    }, {
      isEmpty: (d) => !d.model,
      onFirst: (d) => {
        setModel(d.model);
        setEvals(d.evaluations);
        setCompliance(d.compliance);
        setLoading(false);
      },
    });
    setModel(data.model);
    setEvals(data.evaluations);
    setCompliance(data.compliance);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function patch(body: Record<string, unknown>) {
    if (!model) return;
    setSaving(true);
    await fetch(`/api/governance/models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setSaving(false);
  }

  async function requestApproval() {
    if (!model) return;
    setRequesting(true);
    await fetch("/api/governance/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelGovernanceId: model.id }),
    });
    await load();
    setRequesting(false);
    router.push("/dashboard/governance/approvals");
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Model not found</p>
        <Link href="/dashboard/governance" className="md-btn-outlined text-sm px-4 py-2">
          Back to Trust Center
        </Link>
      </div>
    );
  }

  const status = STATUS_STYLE[model.approvalStatus] ?? STATUS_STYLE.pending;
  const risk = RISK_STYLE[model.riskLevel] ?? RISK_STYLE.medium;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust Center"
        title={model.displayName}
        description={model.description || model.modelId}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/governance" className="md-btn-outlined flex items-center gap-2 px-3 py-2 text-sm">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            {(model.approvalStatus === "pending" || model.approvalStatus === "rejected") && (
              <button
                onClick={requestApproval}
                disabled={requesting}
                className="md-btn-filled flex items-center gap-2 px-4 py-2 text-sm"
              >
                {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                Request approval
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Status</p>
          <span className="mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={status}>
            {model.approvalStatus.replace("_", " ")}
          </span>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Risk</p>
          <span className="mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={risk}>
            {model.riskLevel}
          </span>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Owner</p>
          <p className="mt-2 text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{model.ownerTeam || "Unassigned"}</p>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Registry</h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-auto text-sm"
              value={model.approvalStatus}
              disabled={saving}
              onChange={(e) => patch({ approvalStatus: e.target.value })}
            >
              <option value="pending">Pending</option>
              <option value="in_review">In review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="deprecated">Deprecated</option>
            </select>
            <select
              className="input w-auto text-sm"
              value={model.riskLevel}
              disabled={saving}
              onChange={(e) => patch({ riskLevel: e.target.value })}
            >
              <option value="low">Low risk</option>
              <option value="medium">Medium risk</option>
              <option value="high">High risk</option>
              <option value="critical">Critical risk</option>
            </select>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Model ID</dt>
            <dd className="font-mono mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{model.modelId}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>License</dt>
            <dd className="mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{model.licenseType || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Context</dt>
            <dd className="mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{model.contextWindow?.toLocaleString() || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Regions</dt>
            <dd className="mt-1 uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>{model.allowedRegions?.join(" · ") || "—"}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-4">
          {[
            { ok: model.provenanceVerified, label: "Provenance" },
            { ok: model.biasReviewed, label: "Bias audit" },
            { ok: model.safetyReviewed, label: "Safety" },
          ].map(({ ok, label }) => (
            <span key={label} className="flex items-center gap-1 text-xs" style={{ color: ok ? "var(--green)" : "hsl(var(--muted-foreground))" }}>
              {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {label}
            </span>
          ))}
        </div>

        {model.dataClassesAllowed?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {model.dataClassesAllowed.map((cls) => (
              <span key={cls} className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 capitalize">{cls}</span>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Evaluations</h2>
        {evals.length === 0 ? (
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No evaluations recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {evals.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "hsl(var(--accent))" }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{ev.evaluationName}</p>
                  <p className="text-xs capitalize" style={{ color: "hsl(var(--muted-foreground))" }}>{ev.evaluationType.replace("_", " ")}</p>
                </div>
                <span className={ev.passed
                  ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                  : "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"}>
                  {ev.score ? `${ev.score}%` : ev.passed ? "Pass" : "Fail"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Compliance mappings</h2>
          <Link href="/dashboard/governance/compliance" className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Open Compliance →
          </Link>
        </div>
        {compliance.length === 0 ? (
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No control mappings yet.</p>
        ) : (
          <div className="space-y-1.5">
            {compliance.slice(0, 12).map((row) => (
              <div key={row.mappingId} className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: "hsl(var(--muted-foreground))" }}>
                  <span className="font-mono text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{row.controlCode}</span>{" "}
                  {row.controlName}
                </span>
                <span className="capitalize text-xs" style={{ color: row.status === "compliant" ? "var(--green)" : "hsl(var(--muted-foreground))" }}>
                  {row.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/governance/approvals" className="md-btn-outlined flex items-center gap-2 px-4 py-2 text-sm">
          <ShieldCheck className="h-4 w-4" /> Approvals
        </Link>
        <Link href="/dashboard/governance/violations" className="md-btn-outlined px-4 py-2 text-sm">
          Violations
        </Link>
      </div>
    </div>
  );
}
