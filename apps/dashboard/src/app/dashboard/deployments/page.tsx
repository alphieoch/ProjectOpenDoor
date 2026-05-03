"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Server, Plus, Loader2, ExternalLink, Trash2, Pause, Play } from "lucide-react";

interface Deployment {
  id: string;
  name: string;
  sourceType: string;
  sourceValue: string;
  status: string;
  cpu: string;
  memoryGb: string;
  replicas: number;
  fqdn: string | null;
  createdAt: string;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    running: "badge-success",
    pending: "badge-warning",
    building: "badge-info",
    stopped: "badge-neutral",
    failed: "badge-error",
    deleting: "badge-warning",
  };
  return map[status] || "badge-neutral";
}

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchDeployments() {
    setLoading(true);
    const res = await fetch("/api/deployments");
    if (res.ok) {
      const data = await res.json();
      setDeployments(data.deployments);
    }
    setLoading(false);
  }

  useEffect(() => { fetchDeployments(); }, []);

  async function toggleStatus(deployment: Deployment) {
    const newStatus = deployment.status === "running" ? "stopped" : "running";
    const res = await fetch(`/api/deployments/${deployment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) fetchDeployments();
  }

  async function deleteDeployment(id: string) {
    if (!confirm("Are you sure you want to delete this deployment?")) return;
    const res = await fetch(`/api/deployments/${id}`, { method: "DELETE" });
    if (res.ok) fetchDeployments();
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="page-title">Deployments</h1>
          <p className="page-desc">Manage your self-hosted model containers</p>
        </div>
        <Link href="/dashboard/deployments/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New Deployment
        </Link>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : deployments.length === 0 ? (
        <div className="card p-16 text-center">
          <Server className="mx-auto h-10 w-10 text-zinc-300" />
          <h3 className="mt-4 font-medium text-zinc-900">No deployments yet</h3>
          <p className="mt-1 text-sm text-zinc-500">Deploy your own models or bring a custom container image.</p>
          <Link href="/dashboard/deployments/new" className="btn-primary mt-5 inline-flex">
            <Plus className="h-4 w-4" />
            Create your first deployment
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {deployments.map((d) => (
            <div key={d.id} className="card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-zinc-900">{d.name}</h3>
                    <span className={statusBadge(d.status)}>{d.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {d.sourceType === "image" ? `Image: ${d.sourceValue}` : `Catalog: ${d.sourceValue}`}
                  </p>
                  <div className="mt-2 flex gap-4 text-sm text-zinc-500">
                    <span>{d.cpu} CPU</span>
                    <span>{d.memoryGb} GB RAM</span>
                    <span>{d.replicas} replica{d.replicas !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {d.fqdn && d.status === "running" && (
                    <a
                      href={d.fqdn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost btn-sm"
                      title="Open endpoint"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleStatus(d)}
                    className="btn-ghost btn-sm"
                    title={d.status === "running" ? "Stop" : "Start"}
                  >
                    {d.status === "running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDeployment(d.id)}
                    className="btn-danger btn-sm"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {d.status === "running" && (
                <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <p className="font-medium text-zinc-700">API Usage</p>
                  <code className="mt-1 block text-xs text-zinc-500">model: &quot;custom:{d.id}&quot;</code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
