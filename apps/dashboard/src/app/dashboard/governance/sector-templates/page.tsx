"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  BookOpen,
} from "lucide-react";

interface SectorTemplate {
  id: string;
  sector: string;
  name: string;
  description: string;
  defaultModels: string[];
  defaultPolicies: Record<string, any>;
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
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const res = await fetch("/api/governance/sector-templates");
    const data = await res.json();
    setTemplates(data.templates || []);
    setLoading(false);
  }

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
        <h1 className="text-2xl font-bold text-gray-900">Sector Packs</h1>
        <p className="text-sm text-gray-500">Pre-configured governance templates for UK industries.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {templates.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
                <Building2 className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t.name}</h3>
                <p className="text-xs text-gray-500 capitalize">{t.sector}</p>
              </div>
            </div>

            <p className="mt-3 text-sm text-gray-600">{t.description}</p>

            <div className="mt-4">
              <div className="text-xs font-medium text-gray-500 uppercase">Default Models</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {t.defaultModels?.map((m) => (
                  <span key={m} className="rounded bg-primary-50 px-2 py-0.5 text-xs text-primary-700">{m}</span>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-medium text-gray-500 uppercase">Guardrails</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(t.guardrailConfig || {}).map(([k, v]) => (
                  <span key={k} className="rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-600">{k}: {v as string}</span>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-medium text-gray-500 uppercase">Compliance</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {t.complianceRequirements?.map((req) => (
                  <span key={req} className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">{req}</span>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                {expanded === t.id ? "Hide details" : "View prompt templates"}
                <ChevronRight className={`h-4 w-4 transition-transform ${expanded === t.id ? "rotate-90" : ""}`} />
              </button>
            </div>

            {expanded === t.id && t.promptTemplates && (
              <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
                {Object.entries(t.promptTemplates).map(([name, prompt]) => (
                  <div key={name}>
                    <div className="text-xs font-medium text-gray-700 capitalize">{name}</div>
                    <div className="text-xs text-gray-500">{prompt as string}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
