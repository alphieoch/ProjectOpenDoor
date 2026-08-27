"use client";

import { useEffect, useState, useRef } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, Minus, Loader2, Save, Check,
  Play, FileText, ChevronLeft, ShieldAlert, ShieldCheck, Info,
  ExternalLink, Printer, ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { loadGovernanceData } from "@/lib/governance/ensure-client";

/* ── Types ── */
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

interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  framework: string;
  controlCode: string;
  ruleType: string;
  severity: string;
  recommendation: string;
  referenceUrl: string;
  referenceName: string;
  enabled: boolean;
}

interface ComplianceReport {
  id: string;
  modelGovernanceId: string;
  title: string;
  description: string;
  framework: string | null;
  statusSummary: any;
  findings: any[];
  recommendations: any[];
  score: number;
  passed: boolean;
  generatedAt: string;
}

type Tab = "manual" | "automated";
type AutoSubTab = "rules" | "reports" | "report-detail";

type EditState = Record<string, { status: string; evidence: string; saving?: boolean; saved?: boolean }>;

const levelStyle: Record<string, { bg: string; color: string }> = {
  required:    { bg: "var(--red-soft)",    color: "var(--red)"    },
  recommended: { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  optional:    { bg: "hsl(var(--accent))",     color: "hsl(var(--muted-foreground))"  },
};

const statusStyle: Record<string, { bg: string; color: string }> = {
  compliant:     { bg: "var(--green-soft)",  color: "var(--green)"  },
  partial:       { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  non_compliant: { bg: "var(--red-soft)",    color: "var(--red)"    },
  not_assessed:  { bg: "hsl(var(--accent))",     color: "hsl(var(--muted-foreground))"  },
};

const checkStatusStyle: Record<string, { bg: string; color: string; icon: any }> = {
  passed:  { bg: "var(--green-soft)", color: "var(--green)", icon: CheckCircle2 },
  failed:  { bg: "var(--red-soft)",   color: "var(--red)",   icon: XCircle },
  warning: { bg: "var(--yellow-soft)",color: "var(--yellow)",icon: AlertTriangle },
};

const STATUS_OPTIONS = [
  { value: "compliant", label: "Compliant" },
  { value: "partial", label: "Partial" },
  { value: "non_compliant", label: "Non-compliant" },
  { value: "not_assessed", label: "Not assessed" },
];

const StatusIcon = ({ s }: { s: string }) => {
  if (s === "compliant")     return <CheckCircle2 className="h-3 w-3" />;
  if (s === "non_compliant") return <XCircle className="h-3 w-3" />;
  if (s === "partial")       return <AlertTriangle className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
};

const severityStyle = (s: string) => {
  if (s === "critical") return { bg: "var(--red-soft)", color: "var(--red)" };
  if (s === "high")     return { bg: "var(--orange-soft)", color: "var(--orange)" };
  if (s === "medium")   return { bg: "var(--yellow-soft)", color: "var(--yellow)" };
  return { bg: "hsl(var(--accent))", color: "hsl(var(--muted-foreground))" };
};

/* ── Page ── */
export default function CompliancePage() {
  const [activeTab, setActiveTab] = useState<Tab>("manual");
  const [autoSubTab, setAutoSubTab] = useState<AutoSubTab>("rules");
  const [selectedReport, setSelectedReport] = useState<ComplianceReport | null>(null);

  const [controls, setControls]       = useState<ComplianceControl[]>([]);
  const [models, setModels]           = useState<GovernanceModel[]>([]);
  const [selectedModel, setSelected]  = useState("");
  const [compliance, setCompliance]   = useState<ModelCompliance[]>([]);
  const [loading, setLoading]         = useState(true);
  const [edits, setEdits]             = useState<EditState>({});

  const [rules, setRules]             = useState<ComplianceRule[]>([]);
  const [reports, setReports]         = useState<ComplianceReport[]>([]);
  const [runningCheck, setRunningCheck] = useState(false);
  const [loadingAuto, setLoadingAuto]   = useState(false);
  const autoLoaded = useRef(false);

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const data = await loadGovernanceData(
        async () => {
          const [cRes, mRes] = await Promise.all([
            fetch("/api/governance/compliance-controls"),
            fetch("/api/governance/models?lite=1"),
          ]);
          return {
            controls: await cRes.json(),
            models: await mRes.json(),
          };
        },
        {
          isEmpty: (d) => !(d.controls.controls ?? []).length,
          onFirst: (d) => {
            setControls(d.controls.controls || []);
            setModels(d.models.models || []);
            if (d.models.models?.length) setSelected(d.models.models[0].id);
            setLoading(false);
          },
        },
      );
      setControls(data.controls.controls || []);
      setModels(data.models.models || []);
      if (data.models.models?.length) setSelected(data.models.models[0].id);
      setLoading(false);
    })();
  }, []);
  useEffect(() => { if (selectedModel) loadCompliance(selectedModel); }, [selectedModel]);
  useEffect(() => {
    if (activeTab !== "automated" || autoLoaded.current) return;
    autoLoaded.current = true;
    setLoadingAuto(true);
    Promise.all([loadRules(), loadReports()]).finally(() => setLoadingAuto(false));
  }, [activeTab]);

  async function loadCompliance(id: string) {
    const data = await fetch(`/api/governance/models/${id}/compliance`).then((r) => r.json());
    setCompliance(data.compliance || []);
    setEdits({});
  }
  async function loadRules() {
    const data = await fetch("/api/governance/compliance-rules").then((r) => r.json());
    setRules(data.rules || []);
  }
  async function loadReports() {
    const data = await fetch("/api/governance/compliance-reports").then((r) => r.json());
    setReports(data.reports || []);
  }

  function updateEdit(controlId: string, patch: Partial<EditState[string]>) {
    setEdits((prev) => ({ ...prev, [controlId]: { ...prev[controlId], ...patch } }));
  }

  async function saveControl(controlId: string) {
    const edit = edits[controlId];
    if (!edit) return;
    updateEdit(controlId, { saving: true, saved: false });
    const res = await fetch(`/api/governance/models/${selectedModel}/compliance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlId, status: edit.status, evidence: edit.evidence }),
    });
    if (res.ok) {
      updateEdit(controlId, { saving: false, saved: true });
      await loadCompliance(selectedModel);
      setTimeout(() => setEdits((prev) => { const n = { ...prev }; delete n[controlId]; return n; }), 2000);
    } else {
      updateEdit(controlId, { saving: false, saved: false });
      alert("Failed to save compliance mapping.");
    }
  }

  async function runAutomatedCheck() {
    if (!selectedModel) return;
    setRunningCheck(true);
    try {
      const res = await fetch("/api/governance/compliance-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelGovernanceId: selectedModel }),
      });
      const data = await res.json();
      if (res.ok && data.report) {
        setSelectedReport(data.report);
        setAutoSubTab("report-detail");
        await loadReports();
      } else {
        alert(data.error || "Failed to run compliance check.");
      }
    } catch (e) {
      alert("Failed to run compliance check.");
    }
    setRunningCheck(false);
  }

  function getDisplayStatus(controlId: string, mapping?: ModelCompliance) {
    return edits[controlId]?.status ?? mapping?.status ?? "not_assessed";
  }
  function getDisplayEvidence(controlId: string, mapping?: ModelCompliance) {
    return edits[controlId]?.evidence !== undefined ? edits[controlId].evidence : (mapping?.evidence ?? "");
  }

  const frameworks = Array.from(new Set(controls.map((c) => c.framework)));
  const frameworkStats = frameworks.map((fw) => {
    const fwCompliance = compliance.filter((c) => c.framework === fw);
    return {
      fw, total: controls.filter((c) => c.framework === fw).length,
      compliant: fwCompliance.filter((c) => c.status === "compliant").length,
      partial: fwCompliance.filter((c) => c.status === "partial").length,
      nonCompliant: fwCompliance.filter((c) => c.status === "non_compliant").length,
      notAssessed: fwCompliance.filter((c) => c.status === "not_assessed").length,
    };
  });

  const handlePrintReport = () => {
    const originalTitle = document.title;
    document.title = selectedReport ? `Compliance Report - ${selectedReport.title}` : "Compliance Report";
    window.print();
    document.title = originalTitle;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Compliance"
        description="Map registry models to GDPR, EU AI Act, ICO UK, and NIST controls, then run an automated check. Evidence lives here; enforcement still happens on the gateway."
      />

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b" style={{ borderColor: "hsl(var(--border))" }}>
        {([
          { id: "manual" as Tab,    label: "Manual Tracking",      icon: FileText },
          { id: "automated" as Tab, label: "Automated Compliance",  icon: Play     },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: activeTab === id ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
              borderBottom: activeTab === id ? "2px solid hsl(var(--foreground))" : "2px solid transparent",
              marginBottom: "-1px", background: "transparent", cursor: "pointer",
            }}>
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Manual Tab ── */}
      {activeTab === "manual" && (
        loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
          </div>
        ) : (
          <div className="space-y-6">
            {frameworkStats.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {frameworkStats.map(({ fw, total, compliant, partial, nonCompliant, notAssessed }) => (
                  <div key={fw} className="card p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {fw.replace(/_/g, " ")}
                    </div>
                    <div className="mt-2 text-2xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      {compliant}/{total}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-xs">
                      {partial > 0      && <span style={{ color: "var(--yellow)" }}>{partial} partial</span>}
                      {nonCompliant > 0 && <span style={{ color: "var(--red)" }}>{nonCompliant} non-compliant</span>}
                      {notAssessed > 0  && <span style={{ color: "hsl(var(--muted-foreground))" }}>{notAssessed} not assessed</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {models.length > 0 && (
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Model</label>
                <select value={selectedModel} onChange={(e) => setSelected(e.target.value)} className="input w-auto">
                  {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                </select>
              </div>
            )}
            {frameworks.map((fw) => (
              <div key={fw} className="card overflow-hidden">
                <div className="px-5 py-3" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--accent))" }}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {fw.replace(/_/g, " ")}
                  </h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                      <th className="table-header-cell text-left">Control</th>
                      <th className="table-header-cell text-left">Level</th>
                      <th className="table-header-cell text-left">Status</th>
                      <th className="table-header-cell text-left">Evidence</th>
                      <th className="table-header-cell text-left" style={{ width: "6rem" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {controls.filter((c) => c.framework === fw).map((ctrl) => {
                      const mapping = compliance.find((c) => c.controlId === ctrl.id);
                      const currentStatus = getDisplayStatus(ctrl.id, mapping);
                      const currentEvidence = getDisplayEvidence(ctrl.id, mapping);
                      const lv = levelStyle[ctrl.requirementLevel] ?? levelStyle.optional;
                      const st = statusStyle[currentStatus] ?? statusStyle.not_assessed;
                      const edit = edits[ctrl.id];
                      return (
                        <tr key={ctrl.id} style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                          <td className="table-cell">
                            <div className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{ctrl.controlCode}</div>
                            <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{ctrl.controlName}</div>
                            {ctrl.description && <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{ctrl.description}</div>}
                          </td>
                          <td className="table-cell">
                            <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                              style={{ background: lv.bg, color: lv.color }}>{ctrl.requirementLevel}</span>
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center gap-2">
                              <select value={currentStatus} onChange={(e) => updateEdit(ctrl.id, { status: e.target.value })}
                                className="input text-xs py-1 px-2">
                                {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{ background: st.bg, color: st.color }}>
                                <StatusIcon s={currentStatus} />
                              </span>
                            </div>
                          </td>
                          <td className="table-cell">
                            <input type="text" value={currentEvidence}
                              onChange={(e) => updateEdit(ctrl.id, { evidence: e.target.value })}
                              placeholder="Add evidence…" className="input text-xs w-full" />
                          </td>
                          <td className="table-cell">
                            <button onClick={() => saveControl(ctrl.id)} disabled={!edit || edit.saving}
                              className="md-btn-filled flex items-center gap-1 px-2.5 py-1.5 text-xs disabled:opacity-50">
                              {edit?.saving ? <Loader2 className="h-3 w-3 animate-spin" />
                                : edit?.saved ? <Check className="h-3 w-3" />
                                : <Save className="h-3 w-3" />}
                              {edit?.saving ? "Saving…" : edit?.saved ? "Saved" : "Save"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Automated Tab ── */}
      {activeTab === "automated" && loadingAuto && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
        </div>
      )}
      {activeTab === "automated" && !loadingAuto && (
        <div className="space-y-6">
          {/* Model selector + Run button */}
          <div className="card p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Model</label>
                <select value={selectedModel} onChange={(e) => setSelected(e.target.value)} className="input w-auto">
                  {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1 border-b" style={{ borderColor: "hsl(var(--border))" }}>
                  {([["rules", "Rules"], ["reports", `Reports (${reports.length})`]] as [AutoSubTab, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => { setAutoSubTab(id); setSelectedReport(null); }}
                      className="px-3 py-2 text-xs font-medium transition-colors"
                      style={{
                        color: autoSubTab === id ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                        borderBottom: autoSubTab === id ? "2px solid hsl(var(--foreground))" : "2px solid transparent",
                        marginBottom: "-1px", background: "transparent", cursor: "pointer",
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={runAutomatedCheck}
                  disabled={runningCheck || !selectedModel}
                  className="md-btn-filled flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {runningCheck ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  {runningCheck ? "Running…" : "Run Check"}
                </button>
              </div>
            </div>
          </div>

          {/* Sub: Rules */}
          {autoSubTab === "rules" && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--accent))" }}>
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Automated Compliance Rules
                </h3>
                <p className="mt-1 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  These rules are automatically evaluated when you run a compliance check.
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                    <th className="table-header-cell text-left">Rule</th>
                    <th className="table-header-cell text-left">Framework</th>
                    <th className="table-header-cell text-left">Severity</th>
                    <th className="table-header-cell text-left">Type</th>
                    <th className="table-header-cell text-left">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                      <td className="table-cell">
                        <div className="font-medium text-sm" style={{ color: "hsl(var(--foreground))" }}>{rule.name}</div>
                        <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{rule.description}</div>
                        {rule.recommendation && (
                          <div className="flex items-start gap-1 text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                            <Info className="h-3 w-3 mt-0.5 shrink-0" />
                            {rule.recommendation}
                          </div>
                        )}
                      </td>
                      <td className="table-cell">
                        <span className="text-xs font-medium uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {rule.framework?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                          style={{ background: severityStyle(rule.severity).bg, color: severityStyle(rule.severity).color }}>
                          {rule.severity}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{rule.ruleType.replace(/_/g, " ")}</span>
                      </td>
                      <td className="table-cell">
                        {rule.referenceUrl && (
                          <a href={rule.referenceUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--brand, #0F172A)" }}>
                            <ExternalLink className="h-3 w-3" />
                            {rule.referenceName || "Reference"}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub: Reports list */}
          {autoSubTab === "reports" && (
            <div className="space-y-4">
              {reports.length === 0 ? (
                <div className="card p-8 text-center">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-3" style={{ color: "hsl(var(--muted-foreground))" }} />
                  <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>No reports yet</p>
                  <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Run an automated compliance check to generate your first report.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {reports.map((report) => (
                    <div key={report.id} className="card p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{report.title}</h3>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${report.passed ? "text-green-700" : "text-red-700"}`}
                              style={{ background: report.passed ? "var(--green-soft)" : "var(--red-soft)" }}>
                              {report.passed ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                              {report.passed ? "Passed" : "Issues Found"}
                            </span>
                          </div>
                          <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{report.description}</p>
                          <div className="flex gap-3 mt-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                            <span>Score: <strong style={{ color: "hsl(var(--foreground))" }}>{report.score}%</strong></span>
                            <span>{report.findings?.length || 0} checks</span>
                            <span>{report.recommendations?.length || 0} recommendations</span>
                            <span>{new Date(report.generatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => { setSelectedReport(report); setAutoSubTab("report-detail"); }}
                          className="md-btn-tonal flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0"
                        >
                          View Report <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub: Report Detail */}
          {autoSubTab === "report-detail" && selectedReport && (
            <div className="space-y-6">
              {/* Back button */}
              <div className="flex items-center gap-2">
                <button onClick={() => setAutoSubTab("reports")}
                  className="md-btn-outlined flex items-center gap-1.5 px-3 py-1.5 text-xs">
                  <ChevronLeft className="h-3 w-3" /> Back to Reports
                </button>
                <button onClick={handlePrintReport}
                  className="md-btn-outlined flex items-center gap-1.5 px-3 py-1.5 text-xs">
                  <Printer className="h-3 w-3" /> Print / Save PDF
                </button>
              </div>

              {/* Report Content - print-friendly */}
              <div ref={reportRef} className="space-y-6 print:p-8">
                {/* Header */}
                <div className="card p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>{selectedReport.title}</h2>
                      <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{selectedReport.description}</p>
                      <p className="text-xs mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Generated on {new Date(selectedReport.generatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold" style={{ color: selectedReport.passed ? "var(--green)" : "var(--red)" }}>
                        {selectedReport.score}%
                      </div>
                      <div className="text-xs font-medium mt-1" style={{ color: selectedReport.passed ? "var(--green)" : "var(--red)" }}>
                        {selectedReport.passed ? "COMPLIANT" : "ACTION REQUIRED"}
                      </div>
                    </div>
                  </div>

                  {/* Summary stats */}
                  {selectedReport.statusSummary && (
                    <div className="grid grid-cols-4 gap-3 mt-6">
                      <div className="rounded-lg p-3 text-center" style={{ background: "var(--green-soft)" }}>
                        <div className="text-lg font-semibold" style={{ color: "var(--green)" }}>{selectedReport.statusSummary.passed}</div>
                        <div className="text-xs" style={{ color: "var(--green)" }}>Passed</div>
                      </div>
                      <div className="rounded-lg p-3 text-center" style={{ background: "var(--red-soft)" }}>
                        <div className="text-lg font-semibold" style={{ color: "var(--red)" }}>{selectedReport.statusSummary.failed}</div>
                        <div className="text-xs" style={{ color: "var(--red)" }}>Failed</div>
                      </div>
                      <div className="rounded-lg p-3 text-center" style={{ background: "var(--yellow-soft)" }}>
                        <div className="text-lg font-semibold" style={{ color: "var(--yellow)" }}>{selectedReport.statusSummary.warning}</div>
                        <div className="text-xs" style={{ color: "var(--yellow)" }}>Warnings</div>
                      </div>
                      <div className="rounded-lg p-3 text-center" style={{ background: "hsl(var(--accent))" }}>
                        <div className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>{selectedReport.statusSummary.total}</div>
                        <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Total Checks</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Findings */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-3" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--accent))" }}>
                    <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Findings</h3>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                        <th className="table-header-cell text-left">Check</th>
                        <th className="table-header-cell text-left">Framework</th>
                        <th className="table-header-cell text-left">Severity</th>
                        <th className="table-header-cell text-left">Status</th>
                        <th className="table-header-cell text-left">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReport.findings?.map((finding: any, idx: number) => {
                        const st = checkStatusStyle[finding.status] || checkStatusStyle.warning;
                        const Icon = st.icon;
                        return (
                          <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                            <td className="table-cell">
                              <div className="font-medium text-sm" style={{ color: "hsl(var(--foreground))" }}>{finding.ruleName}</div>
                            </td>
                            <td className="table-cell">
                              <span className="text-xs uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>
                                {finding.framework?.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="table-cell">
                              <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                                style={{ background: severityStyle(finding.severity).bg, color: severityStyle(finding.severity).color }}>
                                {finding.severity}
                              </span>
                            </td>
                            <td className="table-cell">
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                                style={{ background: st.bg, color: st.color }}>
                                <Icon className="h-3 w-3" />
                                {finding.status}
                              </span>
                            </td>
                            <td className="table-cell text-xs max-w-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {finding.detail}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Recommendations */}
                {selectedReport.recommendations && selectedReport.recommendations.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-5 py-3" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--accent))" }}>
                      <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                        Recommendations & Action Items
                      </h3>
                    </div>
                    <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
                      {selectedReport.recommendations.map((rec: any, idx: number) => (
                        <div key={idx} className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              <AlertTriangle className="h-4 w-4" style={{ color: severityStyle(rec.severity).color }} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{rec.ruleName}</span>
                                <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                                  style={{ background: severityStyle(rec.severity).bg, color: severityStyle(rec.severity).color }}>
                                  {rec.severity}
                                </span>
                              </div>
                              <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{rec.recommendation}</p>
                              {rec.referenceUrl && (
                                <a href={rec.referenceUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs mt-2" style={{ color: "hsl(var(--primary))" }}>
                                  <ExternalLink className="h-3 w-3" />
                                  {rec.referenceName || "Learn more"}
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Framework breakdown */}
                {selectedReport.statusSummary?.frameworks && (
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold mb-4" style={{ color: "hsl(var(--foreground))" }}>Framework Breakdown</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Object.entries(selectedReport.statusSummary.frameworks).map(([fw, stats]: [string, any]) => (
                        <div key={fw} className="rounded-lg border p-3" style={{ borderColor: "hsl(var(--border))" }}>
                          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {fw.replace(/_/g, " ")}
                          </div>
                          <div className="mt-2 flex gap-3 text-xs">
                            <span style={{ color: "var(--green)" }}>{stats.passed} passed</span>
                            <span style={{ color: "var(--red)" }}>{stats.failed} failed</span>
                            <span style={{ color: "var(--yellow)" }}>{stats.warning} warnings</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="text-center text-xs py-4" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <p>This report was generated automatically by OpenDoor Governance.</p>
                  <p className="mt-1">For questions about compliance requirements, consult your legal and risk teams.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
