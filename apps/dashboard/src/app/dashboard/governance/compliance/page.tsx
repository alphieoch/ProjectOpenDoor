"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Minus,
} from "lucide-react";

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
  complianceSummary: Record<string, { total: number; compliant: number }>;
}

export default function CompliancePage() {
  const [controls, setControls] = useState<ComplianceControl[]>([]);
  const [models, setModels] = useState<GovernanceModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [compliance, setCompliance] = useState<ModelCompliance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadControls();
    loadModels();
  }, []);

  useEffect(() => {
    if (selectedModel) {
      loadCompliance(selectedModel);
    }
  }, [selectedModel]);

  async function loadControls() {
    const res = await fetch("/api/governance/compliance-controls");
    const data = await res.json();
    setControls(data.controls || []);
  }

  async function loadModels() {
    const res = await fetch("/api/governance/models");
    const data = await res.json();
    setModels(data.models || []);
    if (data.models?.length > 0) {
      setSelectedModel(data.models[0].id);
    }
    setLoading(false);
  }

  async function loadCompliance(modelId: string) {
    const res = await fetch(`/api/governance/models/${modelId}/compliance`);
    const data = await res.json();
    setCompliance(data.compliance || []);
  }

  const frameworks = Array.from(new Set(controls.map((c) => c.framework)));

  const frameworkStats = frameworks.map((fw) => {
    const fwControls = controls.filter((c) => c.framework === fw);
    const fwCompliance = compliance.filter((c) => c.framework === fw);
    const compliant = fwCompliance.filter((c) => c.status === "compliant").length;
    const partial = fwCompliance.filter((c) => c.status === "partial").length;
    const nonCompliant = fwCompliance.filter((c) => c.status === "non_compliant").length;
    const notAssessed = fwCompliance.filter((c) => c.status === "not_assessed").length;
    return { framework: fw, total: fwControls.length, compliant, partial, nonCompliant, notAssessed };
  });

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
        <h1 className="text-2xl font-bold text-gray-900">Compliance & Regulatory Mapping</h1>
        <p className="text-sm text-gray-500">Track model compliance against GDPR, EU AI Act, ICO UK, and NIST AI RMF.</p>
      </div>

      {/* Framework Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {frameworkStats.map((fw) => (
          <div key={fw.framework} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{fw.framework.replace("_", " ")}</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {fw.compliant}/{fw.total}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {fw.partial > 0 && <span className="text-amber-600">{fw.partial} partial </span>}
              {fw.nonCompliant > 0 && <span className="text-red-600">{fw.nonCompliant} non-compliant </span>}
              {fw.notAssessed > 0 && <span className="text-gray-400">{fw.notAssessed} not assessed</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Model Selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Model:</label>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.displayName}</option>
          ))}
        </select>
      </div>

      {/* Controls Table */}
      <div className="space-y-6">
        {frameworks.map((fw) => {
          const fwControls = controls.filter((c) => c.framework === fw);
          return (
            <div key={fw} className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">{fw.replace("_", " ")}</h3>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Control</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Level</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {fwControls.map((control) => {
                    const mapping = compliance.find((c) => c.controlId === control.id);
                    return (
                      <tr key={control.id}>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{control.controlCode}</div>
                          <div className="text-xs text-gray-500">{control.controlName}</div>
                          <div className="text-xs text-gray-400">{control.description}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            control.requirementLevel === "required" ? "bg-red-100 text-red-800" :
                            control.requirementLevel === "recommended" ? "bg-amber-100 text-amber-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
                            {control.requirementLevel}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            mapping?.status === "compliant" ? "bg-green-100 text-green-800" :
                            mapping?.status === "partial" ? "bg-amber-100 text-amber-800" :
                            mapping?.status === "non_compliant" ? "bg-red-100 text-red-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
                            {mapping?.status === "compliant" ? <CheckCircle2 className="h-3 w-3" /> :
                             mapping?.status === "non_compliant" ? <XCircle className="h-3 w-3" /> :
                             mapping?.status === "partial" ? <AlertTriangle className="h-3 w-3" /> :
                             <Minus className="h-3 w-3" />}
                            {mapping?.status?.replace("_", " ") || "not assessed"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">
                          {mapping?.evidence || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
