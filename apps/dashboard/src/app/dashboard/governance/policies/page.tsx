"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Policy {
  id: string;
  name: string;
  description: string;
  dataClass: string;
  modelIdPattern: string;
  userRolePattern: string;
  action: string;
  fallbackModelId: string;
  requireHumanApproval: boolean;
  enabled: boolean;
  priority: number;
}

const actionStyle: Record<string, { bg: string; color: string }> = {
  allow:            { bg: "var(--green-soft)",  color: "var(--green)"  },
  deny:             { bg: "var(--red-soft)",    color: "var(--red)"    },
  require_approval: { bg: "var(--yellow-soft)", color: "var(--yellow)" },
  route_fallback:   { bg: "#DBEAFE",            color: "#1D4ED8"       },
};

const defaultForm: Partial<Policy> = {
  action: "allow", dataClass: "internal", enabled: true, priority: 100, requireHumanApproval: false,
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Policy>>(defaultForm);

  useEffect(() => { loadPolicies(); }, []);

  async function loadPolicies() {
    const res = await fetch("/api/governance/policies");
    const data = await res.json();
    setPolicies(data.policies || []);
    setLoading(false);
  }

  async function createPolicy(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/governance/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setShowForm(false); setForm(defaultForm); loadPolicies(); }
  }

  async function deletePolicy(id: string) {
    if (!confirm("Delete this policy?")) return;
    await fetch(`/api/governance/policies/${id}`, { method: "DELETE" });
    loadPolicies();
  }

  async function togglePolicy(id: string, enabled: boolean) {
    await fetch(`/api/governance/policies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    loadPolicies();
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Policies</h1>
          <p className="page-desc">Define who can use which models, on what data, with what safeguards.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" /> New policy
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : (
        <div className="space-y-5">
          {showForm && (
            <form onSubmit={createPolicy} className="card p-6 space-y-4">
              <h2 className="section-title">New policy</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: "Name", key: "name", required: true, type: "text", placeholder: "" },
                  { label: "Model pattern", key: "modelIdPattern", type: "text", placeholder: "gpt-* or leave blank" },
                  { label: "User role pattern", key: "userRolePattern", type: "text", placeholder: "admin|compliance" },
                  { label: "Fallback model", key: "fallbackModelId", type: "text", placeholder: "" },
                  { label: "Priority (lower = first)", key: "priority", type: "number", placeholder: "" },
                ].map(({ label, key, required, type, placeholder }) => (
                  <div key={key}>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--ink)" }}>{label}</label>
                    <input
                      required={required}
                      type={type}
                      value={(form as Record<string, unknown>)[key] as string ?? ""}
                      placeholder={placeholder}
                      onChange={(e) => setForm({ ...form, [key]: type === "number" ? parseInt(e.target.value) : e.target.value })}
                      className="input w-full"
                    />
                  </div>
                ))}
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--ink)" }}>Action</label>
                  <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} className="input w-full">
                    {[["allow","Allow"],["deny","Deny"],["require_approval","Require approval"],["route_fallback","Route fallback"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--ink)" }}>Data class</label>
                  <select value={form.dataClass} onChange={(e) => setForm({ ...form, dataClass: e.target.value })} className="input w-full">
                    {["public","internal","confidential","restricted"].map((v) => <option key={v} value={v} className="capitalize">{v}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-6 pt-5 sm:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.requireHumanApproval || false} onChange={(e) => setForm({ ...form, requireHumanApproval: e.target.checked })} className="h-4 w-4 rounded accent-indigo-600" />
                    <span style={{ color: "var(--ink-2)" }}>Require human approval</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.enabled || false} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 rounded accent-indigo-600" />
                    <span style={{ color: "var(--ink-2)" }}>Enabled</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--ink)" }}>Description</label>
                <textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" rows={2} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost btn-sm">Cancel</button>
                <button type="submit" className="btn-primary">Create policy</button>
              </div>
            </form>
          )}

          <div className="card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Data class</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center" style={{ color: "var(--ink-3)" }}>
                      No policies yet. Create one to start governing model access.
                    </TableCell>
                  </TableRow>
                ) : policies.map((p) => {
                  const act = actionStyle[p.action] ?? { bg: "var(--paper-3)", color: "var(--ink-2)" };
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium" style={{ color: "var(--ink)" }}>{p.name}</div>
                        {p.description && <div className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>{p.description}</div>}
                      </TableCell>
                      <TableCell className="capitalize" style={{ color: "var(--ink-2)" }}>{p.dataClass}</TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                          style={{ background: act.bg, color: act.color }}>
                          {p.action.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell style={{ color: "var(--ink-2)" }}>{p.priority}</TableCell>
                      <TableCell>
                        <button onClick={() => togglePolicy(p.id, p.enabled)} title={p.enabled ? "Disable" : "Enable"}>
                          {p.enabled
                            ? <CheckCircle2 className="h-5 w-5" style={{ color: "var(--green)" }} />
                            : <XCircle className="h-5 w-5" style={{ color: "var(--ink-4)" }} />}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <button onClick={() => deletePolicy(p.id)} className="btn-ghost btn-sm" style={{ color: "var(--red)" }}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
