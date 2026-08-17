"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Scale,
  Landmark,
  Building2,
  HeartPulse,
  Shield,
  Globe,
  ChevronRight,
  CheckCircle2,
  X,
  Loader2,
  FileText,
  ShieldCheck,
  Zap,
  Umbrella,
  GraduationCap,
  ShoppingBag,
  Tv,
  Truck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { loadGovernanceData } from "@/lib/governance/ensure-client";

interface SectorTemplate {
  id: string;
  sector: string;
  name: string;
  description: string;
  defaultModels: string[];
  defaultPolicies: {
    dataClass?: string;
    requireHumanApproval?: boolean;
    bannedUses?: string[];
  };
  promptTemplates: Record<string, string>;
  guardrailConfig: Record<string, unknown>;
  complianceRequirements: string[];
  enabled: boolean;
}

const SECTOR_META: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  legal:      { icon: Scale,      color: "#1A73E8", bg: "#D3E4FD", label: "Legal & Professional" },
  finance:    { icon: Landmark,   color: "#1E6E4F", bg: "#C8EDD9", label: "Financial Services" },
  property:   { icon: Building2,  color: "#7A5700", bg: "#FFEFC2", label: "Property & Real Estate" },
  healthcare: { icon: HeartPulse, color: "#B3261E", bg: "#F9DEDC", label: "Healthcare & Life Sciences" },
  government: { icon: Shield,     color: "#4B5FBF", bg: "#E3E7FF", label: "Government & Public Sector" },
  general:    { icon: Globe,       color: "#43474E", bg: "#E9EBF2", label: "General" },
  insurance:  { icon: Umbrella,    color: "#1565C0", bg: "#BBDEFB", label: "Insurance" },
  education:  { icon: GraduationCap, color: "#5B4037", bg: "#EFEBE9", label: "Education" },
  energy:     { icon: Zap,         color: "#E65100", bg: "#FFE0B2", label: "Energy & Utilities" },
  retail:     { icon: ShoppingBag, color: "#880E4F", bg: "#FCE4EC", label: "Retail & Consumer" },
  media:      { icon: Tv,          color: "#4A148C", bg: "#EDE7F6", label: "Media & Comms" },
  transport:  { icon: Truck,       color: "#006064", bg: "#E0F7FA", label: "Transport & Logistics" },
};

function complianceFramework(code: string) {
  if (code.startsWith("GDPR")) return { label: "GDPR", cls: "od-tag-brand" };
  if (code.startsWith("AIACT")) return { label: "EU AI Act", cls: "od-tag-neutral" };
  if (code.startsWith("ICO")) return { label: "ICO UK", cls: "od-tag-green" };
  if (code.startsWith("NIST")) return { label: "NIST AI RMF", cls: "od-tag-yellow" };
  return { label: code, cls: "od-tag-neutral" };
}

function uniqueFrameworks(reqs: string[]) {
  const seen = new Set<string>();
  return reqs
    .map(complianceFramework)
    .filter((f) => {
      if (seen.has(f.label)) return false;
      seen.add(f.label);
      return true;
    });
}

function ApplyModal({
  template,
  onClose,
  onApplied,
}: {
  template: SectorTemplate;
  onClose: () => void;
  onApplied: (id: string, count: number) => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [policiesCreated, setPoliciesCreated] = useState(0);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const meta = SECTOR_META[template.sector] ?? SECTOR_META.general;
  const Icon = meta.icon;

  const bannedUses = template.defaultPolicies?.bannedUses ?? [];
  const dataClass = template.defaultPolicies?.dataClass ?? "internal";
  const modelCount = template.defaultModels?.length ?? 0;
  const policyCount = 1 + bannedUses.length;

  async function apply() {
    setState("loading");
    try {
      const res = await fetch(
        `/api/governance/sector-templates/${template.id}/apply`,
        { method: "POST" }
      );
      if (res.ok) {
        const data = await res.json();
        setAlreadyApplied(Boolean(data.alreadyApplied));
        setPoliciesCreated(data.policiesCreated ?? (data.alreadyApplied ? 0 : policyCount));
        setState("done");
        onApplied(template.id, data.policiesCreated ?? policyCount);
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="card w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className="flex items-center gap-3 p-5"
          style={{ background: meta.bg }}
        >
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ background: meta.color }}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
              {meta.label}
            </p>
            <h3 className="text-base font-semibold truncate" style={{ color: "var(--ink)" }}>
              {template.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="md-icon-btn shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {state === "done" ? (
            <div className="text-center py-4">
              <div
                className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full"
                style={{ background: "var(--green-soft)" }}
              >
                <CheckCircle2 className="h-6 w-6" style={{ color: "var(--green)" }} />
              </div>
              <p className="text-base font-semibold" style={{ color: "var(--ink)" }}>
                {alreadyApplied ? "Pack already applied" : "Pack applied"}
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                {alreadyApplied
                  ? "Gateway policies for this pack are already live. Applying again does not create duplicates."
                  : `${policiesCreated} live ${policiesCreated === 1 ? "policy" : "policies"} written for this organisation.`}
              </p>
              <div className="mt-5 flex gap-2 justify-center">
                <a
                  href="/dashboard/governance/policies"
                  className="md-btn-tonal text-sm px-4 py-2"
                >
                  View Policies
                </a>
                <button onClick={onClose} className="md-btn-outlined text-sm px-4 py-2">
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm mb-4" style={{ color: "var(--ink-2)" }}>
                Apply writes gateway policies for this organisation. The next completion with this data class is evaluated against them.
              </p>

              <ul className="space-y-2.5">
                {[
                  { icon: FileText, text: `${policyCount} live ${policyCount === 1 ? "policy" : "policies"} (${dataClass} data${bannedUses.length ? `, ${bannedUses.length} banned-use deny${bannedUses.length === 1 ? "" : "s"}` : ""})` },
                  ...(template.defaultPolicies?.requireHumanApproval
                    ? [{ icon: ShieldCheck, text: "Confidential / restricted calls hold for human approval" }]
                    : []),
                  { icon: Globe, text: `${modelCount} recommended model${modelCount === 1 ? "" : "s"} — approve them in the Trust Center` },
                ].map(({ icon: ItemIcon, text }) => (
                  <li key={text} className="flex items-center gap-2.5">
                    <div
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                      style={{ background: "var(--green-soft)" }}
                    >
                      <ItemIcon className="h-3.5 w-3.5" style={{ color: "var(--green)" }} />
                    </div>
                    <span className="text-sm" style={{ color: "var(--ink-2)" }}>{text}</span>
                  </li>
                ))}
              </ul>

              {template.defaultPolicies?.requireHumanApproval && (
                <div
                  className="mt-4 rounded-xl px-3 py-2.5 text-xs"
                  style={{ background: "var(--yellow-soft)", color: "var(--yellow)" }}
                >
                  Human approval required for all requests under this data classification.
                </div>
              )}

              <div className="mt-5 flex gap-2 justify-end">
                <button
                  onClick={onClose}
                  className="md-btn-outlined text-sm px-4 py-2"
                  disabled={state === "loading"}
                >
                  Cancel
                </button>
                <button
                  onClick={apply}
                  disabled={state === "loading"}
                  className="md-btn-filled text-sm px-4 py-2 flex items-center gap-2"
                >
                  {state === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm &amp; Apply
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PackCard({
  template,
  onApply,
  applied,
}: {
  template: SectorTemplate;
  onApply: (t: SectorTemplate) => void;
  applied: boolean;
}) {
  const meta = SECTOR_META[template.sector] ?? SECTOR_META.general;
  const Icon = meta.icon;
  const frameworks = uniqueFrameworks(template.complianceRequirements ?? []);
  const bannedUses = template.defaultPolicies?.bannedUses ?? [];
  const policyCount = 1 + bannedUses.length;
  const dataClass = template.defaultPolicies?.dataClass ?? "internal";
  const needsApproval = Boolean(template.defaultPolicies?.requireHumanApproval);

  return (
    <div className="card flex flex-col overflow-hidden od-lift">
      {/* Colored header */}
      <div className="px-5 py-4" style={{ background: meta.bg }}>
        <div className="flex items-center gap-3">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ background: meta.color }}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: meta.color }}
            >
              {meta.label}
            </p>
            <h3
              className="text-sm font-semibold leading-tight"
              style={{ color: "var(--ink)" }}
            >
              {template.name}
            </h3>
          </div>
          {applied && (
            <div className="ml-auto shrink-0">
              <span className="od-tag od-tag-green flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Applied
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {template.description}
        </p>

        <div
          className="mt-4 grid grid-cols-3 rounded-xl py-3"
          style={{ background: "var(--paper-3)" }}
        >
          {[
            { n: String(policyCount), label: "Live policies" },
            { n: dataClass, label: "Data class" },
            { n: needsApproval ? "Required" : "Off", label: "Human review" },
          ].map(({ n, label }) => (
            <div key={label} className="text-center px-1">
              <p className="text-sm font-semibold capitalize truncate" style={{ color: "var(--ink)" }}>
                {n}
              </p>
              <p className="text-[10px] font-medium" style={{ color: "var(--ink-4)" }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {bannedUses.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-4)" }}>
              Banned uses
            </p>
            <div className="flex flex-wrap gap-1">
              {bannedUses.map((use) => (
                <span
                  key={use}
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}
                >
                  {use}
                </span>
              ))}
            </div>
          </div>
        )}

        {(template.defaultModels?.length ?? 0) > 0 && (
          <p className="mt-3 text-xs" style={{ color: "var(--ink-4)" }}>
            {template.defaultModels.length} recommended model{template.defaultModels.length === 1 ? "" : "s"} — approve in the Trust Center
          </p>
        )}

        {frameworks.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-4)" }}>
              Designed around
            </p>
            <div className="flex flex-wrap gap-1">
              {frameworks.map((f) => (
                <span key={f.label} className={`od-tag ${f.cls}`}>
                  {f.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Spacer + actions */}
        <div className="mt-auto pt-5 flex items-center gap-2">
          <button
            onClick={() => onApply(template)}
            className="md-btn-filled flex-1 justify-center text-sm py-2"
            disabled={applied}
          >
            {applied ? "Applied" : "Apply Pack"}
          </button>
          <a
            href="/dashboard/governance/policies"
            className="md-btn-outlined text-sm py-2 px-3 flex items-center gap-1 whitespace-nowrap"
          >
            Policies
            <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function SectorTemplatesPage() {
  const [templates, setTemplates] = useState<SectorTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [applyTarget, setApplyTarget] = useState<SectorTemplate | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const data = await loadGovernanceData(
        () => fetch("/api/governance/sector-templates").then((r) => r.json()),
        {
          isEmpty: (d) => !(d.templates ?? []).length,
          onFirst: (d) => {
            setTemplates(d.templates ?? []);
            setAppliedIds(new Set(d.appliedIds ?? []));
            setLoading(false);
          },
        },
      );
      setTemplates(data.templates ?? []);
      setAppliedIds(new Set(data.appliedIds ?? []));
      setLoading(false);
    })();
  }, []);

  const sectors = useMemo(() => {
    const seen = new Set<string>();
    return templates
      .map((t) => t.sector)
      .filter((s) => {
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      });
  }, [templates]);

  const filtered = useMemo(
    () => (filter === "all" ? templates : templates.filter((t) => t.sector === filter)),
    [templates, filter]
  );

  function handleApplied(id: string) {
    setAppliedIds((prev) => new Set([...prev, id]));
  }

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Sector Packs"
        description="One pack per industry. Apply writes live gateway policies for that data class — including human-approval holds and banned-use denies. Recommended models still need Trust Center approval."
        actions={
          !loading && templates.length > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="od-tag od-tag-neutral">{templates.length} industries</span>
              <span className="od-tag od-tag-green">{appliedIds.size} applied</span>
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : templates.length === 0 ? (
        <div className="card flex h-48 flex-col items-center justify-center gap-2">
          <p className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
            No sector packs available
          </p>
          <p className="text-xs" style={{ color: "var(--ink-4)" }}>
            Sector packs load automatically the first time you open Governance. Refresh if this stays empty.
          </p>
        </div>
      ) : (
        <>
          {/* Sector filter tabs */}
          {sectors.length > 1 && (
            <div
              className="mb-5 flex gap-1.5 overflow-x-auto pb-0.5"
              style={{ scrollbarWidth: "none" }}
            >
              {["all", ...sectors].map((s) => {
                const m = SECTOR_META[s];
                const count = s === "all" ? templates.length : templates.filter((t) => t.sector === s).length;
                const active = filter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all"
                    style={{
                      background: active ? (m?.color ?? "var(--ink)") : "var(--paper-3)",
                      color: active ? "#fff" : "var(--ink-2)",
                    }}
                  >
                    {s === "all" ? "All" : (m?.label ?? s)}
                    <span
                      className="rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums"
                      style={{
                        background: active ? "rgba(255,255,255,0.25)" : "var(--paper-2)",
                        color: active ? "#fff" : "var(--ink-3)",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Cards grid */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t, i) => (
              <div
                key={t.id}
                className="od-fade-up"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <PackCard
                  template={t}
                  onApply={setApplyTarget}
                  applied={appliedIds.has(t.id)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Apply modal */}
      {applyTarget && (
        <ApplyModal
          template={applyTarget}
          onClose={() => setApplyTarget(null)}
          onApplied={(id) => {
            handleApplied(id);
          }}
        />
      )}
    </div>
  );
}
