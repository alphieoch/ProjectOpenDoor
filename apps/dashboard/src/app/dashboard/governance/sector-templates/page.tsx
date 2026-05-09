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
  Lock,
  ShieldCheck,
  Zap,
  Umbrella,
  GraduationCap,
  ShoppingBag,
  Tv,
  Truck,
} from "lucide-react";

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

function fmtGuardrail(key: string, val: unknown): string | null {
  if (key === "requireDisclosure") return val ? "Disclosure Required" : null;
  const label = key.replace(/([A-Z])/g, " $1").trim();
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return `${capitalized}: ${String(val).charAt(0).toUpperCase() + String(val).slice(1)}`;
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
  const meta = SECTOR_META[template.sector] ?? SECTOR_META.general;
  const Icon = meta.icon;

  const bannedUses = template.defaultPolicies?.bannedUses ?? [];
  const guardrailCount = Object.keys(template.guardrailConfig ?? {}).length;
  const promptCount = Object.keys(template.promptTemplates ?? {}).length;
  const modelCount = template.defaultModels?.length ?? 0;
  const controlCount = template.complianceRequirements?.length ?? 0;
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
        setPoliciesCreated(data.policiesCreated ?? policyCount);
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
                Pack applied successfully
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                {policiesCreated} model {policiesCreated === 1 ? "policy" : "policies"} created for your organisation.
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
                Applying this pack will configure governance settings for your organisation:
              </p>

              <ul className="space-y-2.5">
                {[
                  { icon: FileText, text: `${policyCount} model ${policyCount === 1 ? "policy" : "policies"} (data class + ${bannedUses.length} banned use${bannedUses.length !== 1 ? "s" : ""})` },
                  { icon: Zap, text: `${guardrailCount} guardrail setting${guardrailCount !== 1 ? "s" : ""} enabled` },
                  { icon: ShieldCheck, text: `${controlCount} compliance control${controlCount !== 1 ? "s" : ""} linked` },
                  { icon: Lock, text: `${promptCount} prompt template${promptCount !== 1 ? "s" : ""} available` },
                  { icon: Globe, text: `${modelCount} pre-approved model${modelCount !== 1 ? "s" : ""} configured` },
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
  const [expanded, setExpanded] = useState(false);
  const meta = SECTOR_META[template.sector] ?? SECTOR_META.general;
  const Icon = meta.icon;
  const frameworks = uniqueFrameworks(template.complianceRequirements ?? []);
  const guardrails = Object.entries(template.guardrailConfig ?? {})
    .map(([k, v]) => fmtGuardrail(k, v))
    .filter(Boolean) as string[];

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

        {/* Stats row */}
        <div
          className="mt-4 grid grid-cols-4 rounded-xl py-3"
          style={{ background: "var(--paper-3)" }}
        >
          {[
            { n: template.defaultModels?.length ?? 0, label: "Models" },
            { n: 1 + (template.defaultPolicies?.bannedUses?.length ?? 0), label: "Policies" },
            { n: Object.keys(template.guardrailConfig ?? {}).length, label: "Guardrails" },
            { n: template.complianceRequirements?.length ?? 0, label: "Controls" },
          ].map(({ n, label }) => (
            <div key={label} className="text-center">
              <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                {n}
              </p>
              <p className="text-[10px] font-medium" style={{ color: "var(--ink-4)" }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Compliance frameworks */}
        {frameworks.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-4)" }}>
              Compliance
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

        {/* Guardrails */}
        {guardrails.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-4)" }}>
              Guardrails
            </p>
            <div className="flex flex-wrap gap-1">
              {guardrails.map((g) => (
                <span
                  key={g}
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Prompt templates toggle */}
        {Object.keys(template.promptTemplates ?? {}).length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: "var(--brand, #1A73E8)" }}
            >
              {expanded ? "Hide" : "View"} prompt templates
              <ChevronRight
                className="h-3.5 w-3.5 transition-transform"
                style={{ transform: expanded ? "rotate(90deg)" : "none" }}
              />
            </button>
            {expanded && (
              <div
                className="mt-2 space-y-2 rounded-xl p-3"
                style={{ background: "var(--paper-3)" }}
              >
                {Object.entries(template.promptTemplates).map(([name, prompt]) => (
                  <div key={name}>
                    <p className="text-[10px] font-semibold capitalize" style={{ color: "var(--ink-2)" }}>
                      {name.replace(/([A-Z])/g, " $1").trim()}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "var(--ink-4)" }}>
                      {prompt}
                    </p>
                  </div>
                ))}
              </div>
            )}
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
    fetch("/api/governance/sector-templates")
      .then((r) => r.json())
      .then((data) => {
        setTemplates(data.templates ?? []);
        setLoading(false);
      });
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

  const totalControls = useMemo(() => {
    const all = new Set<string>();
    templates.forEach((t) => t.complianceRequirements?.forEach((r) => all.add(r)));
    return all.size;
  }, [templates]);

  function handleApplied(id: string) {
    setAppliedIds((prev) => new Set([...prev, id]));
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Sector Packs</h1>
          <p className="page-desc">Pre-configured governance templates for UK industries.</p>
        </div>

        {/* Summary pills */}
        {!loading && templates.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="od-tag od-tag-neutral">{templates.length} Packs</span>
            <span className="od-tag od-tag-neutral">4 Frameworks</span>
            <span className="od-tag od-tag-green">{totalControls} Controls</span>
            <span className="od-tag od-tag-brand">UK Ready</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : templates.length === 0 ? (
        <div className="card flex h-48 flex-col items-center justify-center gap-2">
          <p className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
            No sector packs available
          </p>
          <p className="text-xs" style={{ color: "var(--ink-4)" }}>
            Run the enterprise governance seed script to load UK sector packs.
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
                style={{ animationDelay: `${i * 60}ms` }}
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
