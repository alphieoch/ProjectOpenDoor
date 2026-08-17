"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Server, Plus, Loader2, ExternalLink, Trash2, Pause, Play } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface Deployment {
  id: string;
  name: string;
  sourceType: string;
  sourceValue: string;
  status: string;
  statusMessage?: string | null;
  cpu: string;
  memoryGb: string;
  replicas: number;
  target?: string;
  gpuType?: string;
  runtimeModel?: string | null;
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
      <PageHeader
        eyebrow="Dedicated"
        title="Deployments"
        description="Request a GPU here or on GCP and run open models end to end. Separate from serverless."
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/deployments/routers" className="btn-ghost">
              Routers
            </Link>
            <Link href="/dashboard/deployments/new" className="btn-primary">
              <Plus className="h-4 w-4" />
              Request GPU
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--ink-4)" }} />
        </div>
      ) : deployments.length === 0 ? (
        <div className="card p-16 text-center">
          <Server className="mx-auto h-10 w-10" style={{ color: "var(--ink-4)" }} />
          <h3 className="mt-4 font-medium" style={{ color: "var(--ink)" }}>No deployments yet</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
            Request a GPU on this Mac or GCP and run a catalog model.
          </p>
          <Link href="/dashboard/deployments/new" className="btn-primary mt-5 inline-flex">
            <Plus className="h-4 w-4" />
            Request your first GPU
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {deployments.map((d) => (
            <div key={d.id} className="od-card od-lift p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/deployments/${d.id}`}
                      className="font-semibold hover:underline"
                      style={{ color: "var(--ink)" }}
                    >
                      {d.name}
                    </Link>
                    <span className={statusBadge(d.status)}>{d.status}</span>
                  </div>
                  <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                    {d.sourceType === "image" ? `Image: ${d.sourceValue}` : `Catalog: ${d.sourceValue}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm" style={{ color: "var(--ink-3)" }}>
                    <span>{d.target === "local" ? "This Mac" : d.target === "gcp" ? "GCP" : "Azure"}</span>
                    <span>{d.gpuType && d.gpuType !== "none" ? `GPU: ${d.gpuType}` : `${d.cpu} CPU`}</span>
                    {d.runtimeModel && <span>{d.runtimeModel}</span>}
                    <span>{d.replicas} replica{d.replicas !== 1 ? "s" : ""}</span>
                  </div>
                  {d.statusMessage && (
                    <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>{d.statusMessage}</p>
                  )}
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
                <div className="mt-4 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
                  <p className="font-medium" style={{ color: "var(--ink-2)" }}>API Usage</p>
                  <code className="mt-1 block text-xs" style={{ color: "var(--ink-3)" }}>
                    model: &quot;custom:{d.id}&quot;
                  </code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
