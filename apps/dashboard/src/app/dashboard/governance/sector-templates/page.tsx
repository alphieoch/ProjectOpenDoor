"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronRight, Loader2 } from "lucide-react";

interface SectorTemplate {
  id: string;
  sector: string;
  name: string;
  description: string;
  defaultModels: string[];
  defaultPolicies: Record<string, unknown>;
  promptTemplates: Record<string, string>;
  guardrailConfig: Record<string, string>;
  complianceRequirements: string[];
  enabled: boolean;
}

export default function SectorTemplatesPage() {
  const [templates, setTemplates] = useState<SectorTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/governance/sector-templates")
      .then((r) => r.json())
      .then((data) => { setTemplates(data.templates || []); setLoading(false); });
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Sector Packs</h1>
        <p className="page-desc">Pre-configured governance templates for UK industries.</p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : templates.length === 0 ? (
        <div className="card flex h-48 items-center justify-center" style={{ color: "var(--ink-3)" }}>
          No sector packs available.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="card flex flex-col p-6 transition-shadow hover:shadow-md">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: "var(--brand-container)" }}
                >
                  <Building2 className="h-5 w-5" style={{ color: "var(--brand)" }} />
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: "var(--ink)" }}>{t.name}</h3>
                  <p className="text-xs capitalize" style={{ color: "var(--ink-3)" }}>{t.sector}</p>
                </div>
              </div>

              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{t.description}</p>

              {/* Default models */}
              {t.defaultModels?.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-4)" }}>
                    Default models
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.defaultModels.map((m) => (
                      <span key={m} className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: "var(--brand-container)", color: "var(--brand)" }}>{m}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Guardrails */}
              {Object.keys(t.guardrailConfig || {}).length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-4)" }}>
                    Guardrails
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(t.guardrailConfig).map(([k, v]) => (
                      <span key={k} className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}>
                        {k}: {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Compliance requirements */}
              {t.complianceRequirements?.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-4)" }}>
                    Compliance
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.complianceRequirements.map((req) => (
                      <span key={req} className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: "var(--green-soft)", color: "var(--green)" }}>{req}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Prompt templates toggle */}
              {t.promptTemplates && Object.keys(t.promptTemplates).length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                    className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
                    style={{ color: "var(--brand)" }}
                  >
                    {expanded === t.id ? "Hide details" : "View prompt templates"}
                    <ChevronRight
                      className="h-4 w-4 transition-transform"
                      style={{ transform: expanded === t.id ? "rotate(90deg)" : "none" }}
                    />
                  </button>

                  {expanded === t.id && (
                    <div className="mt-3 space-y-2 rounded-xl p-3" style={{ background: "var(--paper-3)" }}>
                      {Object.entries(t.promptTemplates).map(([name, prompt]) => (
                        <div key={name}>
                          <div className="text-xs font-medium capitalize" style={{ color: "var(--ink-2)" }}>{name}</div>
                          <div className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>{prompt}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
