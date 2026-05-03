"use client";

import { useEffect, useState } from "react";
import {
  Shield,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
} from "lucide-react";

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

const actionColors: Record<string, string> = {
  allow: "bg-green-100 text-green-800",
  deny: "bg-red-100 text-red-800",
  require_approval: "bg-amber-100 text-amber-800",
  route_fallback: "bg-blue-100 text-blue-800",
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Policy>>({
    action: "allow",
    dataClass: "internal",
    enabled: true,
    priority: 100,
    requireHumanApproval: false,
  });

  useEffect(() => {
    loadPolicies();
  }, []);

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
    if (res.ok) {
      setShowForm(false);
      setForm({ action: "allow", dataClass: "internal", enabled: true, priority: 100, requireHumanApproval: false });
      loadPolicies();
    }
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Model Policies</h1>
          <p className="text-sm text-gray-500">Define who can use which models, on what data, with what safeguards.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" /> New Policy
        </button>
      </div>

      {showForm && (
        <form onSubmit={createPolicy} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input required value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Action</label>
              <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="require_approval">Require Approval</option>
                <option value="route_fallback">Route Fallback</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Data Class</label>
              <select value={form.dataClass} onChange={(e) => setForm({ ...form, dataClass: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Model Pattern (optional)</label>
              <input value={form.modelIdPattern || ""} onChange={(e) => setForm({ ...form, modelIdPattern: e.target.value })} placeholder="gpt-* or leave blank for all" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">User Role Pattern (optional)</label>
              <input value={form.userRolePattern || ""} onChange={(e) => setForm({ ...form, userRolePattern: e.target.value })} placeholder="admin|compliance" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fallback Model (if action is fallback)</label>
              <input value={form.fallbackModelId || ""} onChange={(e) => setForm({ ...form, fallbackModelId: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Priority (lower = first)</label>
              <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.requireHumanApproval || false} onChange={(e) => setForm({ ...form, requireHumanApproval: e.target.checked })} />
                Require human approval
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.enabled || false} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                Enabled
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">Create Policy</button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Policy</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Data Class</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Priority</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {policies.map((p) => (
              <tr key={p.id}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.description}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 capitalize">{p.dataClass}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${actionColors[p.action] || "bg-gray-100 text-gray-800"}`}>
                    {p.action.replace("_", " ")}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">{p.priority}</td>
                <td className="px-6 py-4">
                  <button onClick={() => togglePolicy(p.id, p.enabled)} className="text-sm">
                    {p.enabled ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => deletePolicy(p.id)} className="text-red-600 hover:text-red-900">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
