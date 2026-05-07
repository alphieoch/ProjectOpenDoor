"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Minus, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ComplianceControl {
  id: string;
  framework: string;
  controlCode: string;
  controlName: string;
  description: string;
  requirementLevel: string;
  guidance: string;
}

interface ModelCompliance {
  mappingId: string;
  controlId: string;
  framework: string;
  controlCode: string;
  controlName: string;
  requirementLevel: string;
  status: string;
  evidence: string;
  assessedAt: string;
}

interface GovernanceModel {
  id: string;
  modelId: string;
  displayName: string;
}

const levelStyle: Record<string, { bg: string; color: string }> = {
  required:    { bg: "var(--red-soft)",    color: "var(--red)"    },
  recommended: { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  optional:    { bg: "var(--paper-3)",     color: "var(--ink-3)"  },
};

const statusStyle: Record<string, { bg: string; color: string }> = {
  compliant:     { bg: "var(--green-soft)",  color: "var(--green)"  },
  partial:       { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  non_compliant: { bg: "var(--red-soft)",    color: "var(--red)"    },
  not_assessed:  { bg: "var(--paper-3)",     color: "var(--ink-3)"  },
};

const StatusIcon = ({ s }: { s: string }) => {
  if (s === "compliant")     return <CheckCircle2 className="h-3 w-3" />;
  if (s === "non_compliant") return <XCircle className="h-3 w-3" />;
  if (s === "partial")       return <AlertTriangle className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
};

export default function CompliancePage() {
  const [controls, setControls]       = useState<ComplianceControl[]>([]);
  const [models, setModels]           = useState<GovernanceModel[]>([]);
  const [selectedModel, setSelected]  = useState("");
  const [compliance, setCompliance]   = useState<ModelCompliance[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => { loadControls(); loadModels(); }, []);
  useEffect(() => { if (selectedModel) loadCompliance(selectedModel); }, [selectedModel]);

  async function loadControls() {
    const data = await fetch("/api/governance/compliance-controls").then((r) => r.json());
    setControls(data.controls || []);
  }
  async function loadModels() {
    const data = await fetch("/api/governance/models").then((r) => r.json());
    setModels(data.models || []);
    if (data.models?.length) setSelected(data.models[0].id);
    setLoading(false);
  }
  async function loadCompliance(id: string) {
    const data = await fetch(`/api/governance/models/${id}/compliance`).then((r) => r.json());
    setCompliance(data.compliance || []);
  }

  const frameworks = Array.from(new Set(controls.map((c) => c.framework)));
  const frameworkStats = frameworks.map((fw) => {
    const fwCompliance = compliance.filter((c) => c.framework === fw);
    return {
      fw,
      total:       controls.filter((c) => c.framework === fw).length,
      compliant:   fwCompliance.filter((c) => c.status === "compliant").length,
      partial:     fwCompliance.filter((c) => c.status === "partial").length,
      nonCompliant:fwCompliance.filter((c) => c.status === "non_compliant").length,
      notAssessed: fwCompliance.filter((c) => c.status === "not_assessed").length,
    };
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Compliance</h1>
        <p className="page-desc">Track model compliance against GDPR, EU AI Act, ICO UK, and NIST AI RMF.</p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Framework summary */}
          {frameworkStats.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {frameworkStats.map(({ fw, total, compliant, partial, nonCompliant, notAssessed }) => (
                <div key={fw} className="card p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-4)" }}>
                    {fw.replace(/_/g, " ")}
                  </div>
                  <div className="mt-2 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
                    {compliant}/{total}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs">
                    {partial > 0      && <span style={{ color: "var(--yellow)" }}>{partial} partial</span>}
                    {nonCompliant > 0 && <span style={{ color: "var(--red)" }}>{nonCompliant} non-compliant</span>}
                    {notAssessed > 0  && <span style={{ color: "var(--ink-4)" }}>{notAssessed} not assessed</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Model selector */}
          {models.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium" style={{ color: "var(--ink)" }}>Model</label>
              <select value={selectedModel} onChange={(e) => setSelected(e.target.value)} className="input w-auto">
                {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
              </select>
            </div>
          )}

          {/* Controls by framework */}
          {frameworks.map((fw) => (
            <div key={fw} className="card overflow-hidden">
              <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--line)", background: "var(--paper-3)" }}>
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-2)" }}>
                  {fw.replace(/_/g, " ")}
                </h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Control</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controls.filter((c) => c.framework === fw).map((ctrl) => {
                    const mapping = compliance.find((c) => c.controlId === ctrl.id);
                    const lv = levelStyle[ctrl.requirementLevel] ?? levelStyle.optional;
                    const st = statusStyle[mapping?.status ?? "not_assessed"];
                    return (
                      <TableRow key={ctrl.id}>
                        <TableCell>
                          <div className="font-medium" style={{ color: "var(--ink)" }}>{ctrl.controlCode}</div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--ink-2)" }}>{ctrl.controlName}</div>
                          {ctrl.description && (
                            <div className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>{ctrl.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                            style={{ background: lv.bg, color: lv.color }}>{ctrl.requirementLevel}</span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                            style={{ background: st.bg, color: st.color }}>
                            <StatusIcon s={mapping?.status ?? "not_assessed"} />
                            {(mapping?.status ?? "not assessed").replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs truncate" style={{ color: "var(--ink-2)" }}>
                          {mapping?.evidence || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
