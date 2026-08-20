"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { GovernancePath } from "@/components/governance-path";
import { loadGovernanceData } from "@/lib/governance/ensure-client";
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
  SortAsc,
  LayoutList,
  LayoutGrid,
  X,
  Shield,
  Loader2,
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

const RISK_CONFIG: Record<string, { label: string; tagClass: string; dotClass: string }> = {
  low:      { label: "Low",      tagClass: "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400",   dotClass: "inline-block size-1.5 rounded-full bg-emerald-500"  },
  medium:   { label: "Medium",   tagClass: "inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400",  dotClass: "inline-block size-1.5 rounded-full bg-amber-500" },
  high:     { label: "High",     tagClass: "inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive",     dotClass: "inline-block size-1.5 rounded-full bg-destructive"    },
  critical: { label: "Critical", tagClass: "inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive",     dotClass: "inline-block size-1.5 rounded-full bg-destructive"    },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; tagClass: string }> = {
  approved:   { label: "Approved",   icon: <CheckCircle2 className="h-3.5 w-3.5" />, tagClass: "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"   },
  pending:    { label: "Pending",    icon: <Clock className="h-3.5 w-3.5" />,         tagClass: "inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"  },
  in_review:  { label: "In Review",  icon: <Clock className="h-3.5 w-3.5" />,         tagClass: "inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400"    },
  rejected:   { label: "Rejected",   icon: <XCircle className="h-3.5 w-3.5" />,       tagClass: "inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"     },
  deprecated: { label: "Deprecated", icon: <AlertTriangle className="h-3.5 w-3.5" />, tagClass: "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground" },
};

type SortKey = "name" | "risk" | "status" | "reviewed";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name",     label: "Name A–Z"      },
  { value: "risk",     label: "Risk (highest)" },
  { value: "status",   label: "Status"         },
  { value: "reviewed", label: "Last reviewed"  },
];

const RISK_ORDER: Record<string, number>   = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<string, number> = { in_review: 0, pending: 1, approved: 2, rejected: 3, deprecated: 4 };

function sortModels(models: GovernanceModel[], key: SortKey) {
  return [...models].sort((a, b) => {
    if (key === "name")     return a.displayName.localeCompare(b.displayName);
    if (key === "risk")     return (RISK_ORDER[a.riskLevel] ?? 9) - (RISK_ORDER[b.riskLevel] ?? 9);
    if (key === "status")   return (STATUS_ORDER[a.approvalStatus] ?? 9) - (STATUS_ORDER[b.approvalStatus] ?? 9);
    if (key === "reviewed") {
      const da = a.lastReviewedAt ? new Date(a.lastReviewedAt).getTime() : 0;
      const db = b.lastReviewedAt ? new Date(b.lastReviewedAt).getTime() : 0;
      return db - da;
    }
    return 0;
  });
}

export default function TrustCenterPage() {
  const [models, setModels] = useState<GovernanceModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [activeRisks, setActiveRisks] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("risk");
  const [view, setView] = useState<"card" | "compact">("card");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadGovernanceData(
          () => fetch("/api/governance/trust-center").then((r) => r.json()),
          {
            isEmpty: (d) => !(d.models || []).length,
            onFirst: (d) => {
              if (!cancelled) {
                setModels(d.models || []);
                setLoading(false);
              }
            },
          },
        );
        if (!cancelled) setModels(data.models || []);
      } catch {
        /* keep empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggleStatus(s: string) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  function toggleRisk(r: string) {
    setActiveRisks((prev) => {
      const next = new Set(prev);
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setActiveStatuses(new Set());
    setActiveRisks(new Set());
  }

  const stats = {
    total:    models.length,
    approved: models.filter((m) => m.approvalStatus === "approved").length,
    pending:  models.filter((m) => m.approvalStatus === "pending" || m.approvalStatus === "in_review").length,
    highRisk: models.filter((m) => m.riskLevel === "high" || m.riskLevel === "critical").length,
  };

  const filtered = sortModels(
    models.filter((m) => {
      const matchesSearch =
        !search ||
        m.displayName.toLowerCase().includes(search.toLowerCase()) ||
        m.modelId.toLowerCase().includes(search.toLowerCase()) ||
        m.ownerTeam?.toLowerCase().includes(search.toLowerCase()) ||
        m.businessLabels?.some((l) => l.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(m.approvalStatus);
      const matchesRisk   = activeRisks.size === 0   || activeRisks.has(m.riskLevel);
      return matchesSearch && matchesStatus && matchesRisk;
    }),
    sort
  );

  const hasFilters = search || activeStatuses.size > 0 || activeRisks.size > 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Trust Center"
        description="The inventory of models this workspace is allowed to call. Approving a model here unblocks it on the live gateway — the same path your API keys use."
      />

      <GovernancePath />

      {/* Stat cards — clickable filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          onClick={clearFilters}
          className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-lg transition-shadow hover:shadow-lg text-left focus:outline-none"
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Total Models</div>
          <div className="text-3xl font-semibold tracking-tight text-foreground mt-2">{stats.total}</div>
          <div className="mt-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Show all →</div>
        </button>

        <button
          onClick={() => setActiveStatuses(new Set(["approved"]))}
          className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-lg transition-shadow hover:shadow-lg text-left focus:outline-none"
          style={activeStatuses.size === 1 && activeStatuses.has("approved")
            ? { outline: "2px solid var(--green)", outlineOffset: "2px" } : {}}
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Approved</div>
          <div className="text-3xl font-semibold tracking-tight text-foreground mt-2" style={{ color: "var(--green)" }}>{stats.approved}</div>
          <div className="mt-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Filter →</div>
        </button>

        <button
          onClick={() => setActiveStatuses(new Set(["pending", "in_review"]))}
          className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-lg transition-shadow hover:shadow-lg text-left focus:outline-none"
          style={(activeStatuses.has("pending") || activeStatuses.has("in_review"))
            ? { outline: "2px solid var(--yellow)", outlineOffset: "2px" } : {}}
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Pending / Review</div>
          <div className="text-3xl font-semibold tracking-tight text-foreground mt-2" style={{ color: "var(--yellow)" }}>{stats.pending}</div>
          <div className="mt-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Filter →</div>
        </button>

        <button
          onClick={() => setActiveRisks(new Set(["high", "critical"]))}
          className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-lg transition-shadow hover:shadow-lg text-left focus:outline-none"
          style={(activeRisks.has("high") || activeRisks.has("critical"))
            ? { outline: "2px solid var(--red)", outlineOffset: "2px" } : {}}
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">High / Critical Risk</div>
          <div className="text-3xl font-semibold tracking-tight text-foreground mt-2" style={{ color: "var(--red)" }}>{stats.highRisk}</div>
          <div className="mt-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Filter →</div>
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-4 space-y-3">
        {/* Search + sort + view toggle */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
            <input
              type="text"
              placeholder="Search models, teams, labels…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm py-2 pl-9 pr-3 text-sm"
              style={{ fontSize: "14px", padding: "8px 12px 8px 36px" }}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <SortAsc className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-sm"
              style={{ fontSize: "13px", padding: "7px 10px", width: "auto" }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* View toggle */}
            <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "hsl(var(--border))" }}>
              <button
                onClick={() => setView("card")}
                title="Card view"
                className="px-2.5 py-2 transition-colors"
                style={view === "card"
                  ? { background: "hsl(var(--primary))", color: "var(--md-on-primary)" }
                  : { background: "transparent", color: "hsl(var(--muted-foreground))" }}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("compact")}
                title="Compact view"
                className="px-2.5 py-2 transition-colors"
                style={view === "compact"
                  ? { background: "hsl(var(--primary))", color: "var(--md-on-primary)" }
                  : { background: "transparent", color: "hsl(var(--muted-foreground))" }}
              >
                <LayoutList className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Chip filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Status</span>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => toggleStatus(key)}
              className={`md-chip ${activeStatuses.has(key) ? "md-chip-selected" : ""}`}
              style={{ height: "28px", padding: "0 12px", fontSize: "12px" }}
            >
              {cfg.icon}{cfg.label}
            </button>
          ))}

          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-3">Risk</span>
          {Object.entries(RISK_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => toggleRisk(key)}
              className={`md-chip ${activeRisks.has(key) ? "md-chip-selected" : ""}`}
              style={{ height: "28px", padding: "0 12px", fontSize: "12px" }}
            >
              <span className={cfg.dotClass} />
              {cfg.label}
            </button>
          ))}

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="md-chip ml-auto"
              style={{ height: "28px", padding: "0 12px", fontSize: "12px", color: "hsl(var(--destructive))" }}
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
        Showing <span className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>{filtered.length}</span> of {models.length} models
      </p>

      {/* Model list */}
      <div className={view === "card" ? "space-y-3" : "rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden"}>
        {models.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-card text-card-foreground shadow-sm">
            <Shield className="h-10 w-10 mb-3" style={{ color: "var(--md-outline)" }} />
            <p className="text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>No models in the Trust Center yet</p>
            <p className="mt-1 max-w-sm text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Refresh this page after signing in — the workspace registry loads automatically.
            </p>
          </div>
        )}

        {models.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-card text-card-foreground shadow-sm">
            <Shield className="h-10 w-10 mb-3" style={{ color: "var(--md-outline)" }} />
            <p className="text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>No models match your filters</p>
            <button onClick={clearFilters} className="md-btn-text mt-2 text-sm" style={{ height: "auto", padding: "4px 8px" }}>
              Clear filters
            </button>
          </div>
        )}

        {filtered.map((model, i) =>
          view === "card" ? (
            <CardView key={model.id} model={model} index={i} />
          ) : (
            <CompactRow key={model.id} model={model} />
          )
        )}
      </div>
    </div>
  );
}

function CardView({ model, index }: { model: GovernanceModel; index: number }) {
  const risk   = RISK_CONFIG[model.riskLevel];
  const status = STATUS_CONFIG[model.approvalStatus];

  return (
    <div
      className="rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-lg p-5"
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Top row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={risk?.dotClass ?? "inline-block size-1.5 rounded-full bg-muted-foreground"} />
            <h3 className="text-sm font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>
              {model.displayName}
            </h3>
            <span className={risk?.tagClass ?? "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>{model.riskLevel.toUpperCase()}</span>
            <span className={status?.tagClass ?? "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>
              {status?.icon}{status?.label ?? model.approvalStatus}
            </span>
            {model.pendingApproval && (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"><Clock className="h-3 w-3" /> Approval pending</span>
            )}
          </div>

          <p className="mt-1.5 text-sm line-clamp-2" style={{ color: "hsl(var(--muted-foreground))" }}>
            {model.description}
          </p>

          {/* Meta */}
          <div className="mt-2 flex flex-wrap gap-4 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            {model.ownerTeam && (
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {model.ownerTeam}</span>
            )}
            {model.businessCriticality && (
              <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" /> {model.businessCriticality}</span>
            )}
            {model.allowedRegions && model.allowedRegions.length > 0 && (
              <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> {model.allowedRegions.join(", ")}</span>
            )}
            {model.lastReviewedByName && (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> {model.lastReviewedByName}
                {model.lastReviewedAt && ` · ${new Date(model.lastReviewedAt).toLocaleDateString()}`}
              </span>
            )}
          </div>

          {/* Tags */}
          {(model.businessLabels?.length > 0 || model.sectorTags?.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {model.businessLabels?.map((label) => (
                <span key={label} className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{label}</span>
              ))}
              {model.sectorTags?.map((tag) => (
                <span key={tag} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{tag}</span>
              ))}
            </div>
          )}

          {/* Detail grid */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg p-2.5" style={{ background: "var(--md-surface-container-high)" }}>
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Allowed Data</div>
              <div className="flex flex-wrap gap-1">
                {model.dataClassesAllowed?.map((dc) => (
                  <span key={dc} className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400" style={{ fontSize: "11px" }}>{dc}</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg p-2.5" style={{ background: "var(--md-surface-container-high)" }}>
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-1.5">License</div>
              <div className="text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>{model.licenseType || "Unknown"}</div>
            </div>
            <div className="rounded-lg p-2.5" style={{ background: "var(--md-surface-container-high)" }}>
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Context</div>
              <div className="text-xs font-medium font-mono" style={{ color: "hsl(var(--foreground))" }}>
                {model.contextWindow?.toLocaleString() || "N/A"}
              </div>
            </div>
          </div>

          {/* Evaluations */}
          {model.latestEvaluations && model.latestEvaluations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {model.latestEvaluations.map((ev) => (
                <span
                  key={ev.id}
                  className={ev.passed
                    ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                    : "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"}
                >
                  {ev.passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {ev.evaluationName}{ev.score ? ` · ${ev.score}%` : ""}
                </span>
              ))}
            </div>
          )}

          {/* Compliance */}
          {model.complianceSummary && Object.keys(model.complianceSummary).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(model.complianceSummary).map(([framework, counts]) => (
                <div key={framework} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground" style={{ gap: "6px" }}>
                  <span className="font-bold">{framework.replace("_", " ").toUpperCase()}</span>
                  <span style={{ color: "var(--green)" }}>{counts.compliant}/{counts.total}</span>
                  {counts.partial > 0 && <span style={{ color: "var(--yellow)" }}>·{counts.partial}p</span>}
                  {counts.nonCompliant > 0 && <span style={{ color: "var(--red)" }}>·{counts.nonCompliant}✗</span>}
                </div>
              ))}
            </div>
          )}

          {/* Violations */}
          {model.recentViolations && model.recentViolations.length > 0 && (
            <div className="mt-3 rounded-lg px-3 py-2" style={{ background: "var(--md-error-container)" }}>
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-1" style={{ color: "var(--md-on-error-container)" }}>Recent Violations</div>
              <div className="flex flex-wrap gap-1.5">
                {model.recentViolations.map((v) => (
                  <span key={v.id} className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">{v.violationType} · {v.severity}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <Link
          href={`/dashboard/governance/models/${model.id}`}
          className="md-btn-tonal shrink-0 text-xs"
          style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}
        >
          Details <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function CompactRow({ model }: { model: GovernanceModel }) {
  const risk   = RISK_CONFIG[model.riskLevel];
  const status = STATUS_CONFIG[model.approvalStatus];

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 transition-colors"
      style={{ borderBottom: "1px solid hsl(var(--border))" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, hsl(var(--foreground)) 4%, transparent)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span className={risk?.dotClass ?? "inline-block size-1.5 rounded-full bg-muted-foreground"} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>{model.displayName}</span>
          {model.ownerTeam && (
            <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{model.ownerTeam}</span>
          )}
        </div>
        <p className="font-mono text-xs truncate" style={{ color: "hsl(var(--muted-foreground))" }}>{model.modelId}</p>
      </div>

      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <span className={risk?.tagClass ?? "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>{model.riskLevel.toUpperCase()}</span>
        <span className={status?.tagClass ?? "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>
          {status?.icon}{status?.label ?? model.approvalStatus}
        </span>
        {model.recentViolations?.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            {model.recentViolations.length} violation{model.recentViolations.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <Link
        href={`/dashboard/governance/models/${model.id}`}
        className="md-icon-btn shrink-0"
        style={{ width: "32px", height: "32px" }}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
