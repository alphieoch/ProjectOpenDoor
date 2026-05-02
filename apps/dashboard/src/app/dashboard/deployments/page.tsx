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

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  building: "bg-blue-100 text-blue-800",
  running: "bg-green-100 text-green-800",
  stopped: "bg-gray-100 text-gray-800",
  failed: "bg-red-100 text-red-800",
  deleting: "bg-orange-100 text-orange-800",
};

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

  useEffect(() => {
    fetchDeployments();
  }, []);

  async function toggleStatus(deployment: Deployment) {
    const newStatus = deployment.status === "running" ? "stopped" : "running";
    const res = await fetch(`/api/deployments/${deployment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      fetchDeployments();
    }
  }

  async function deleteDeployment(id: string) {
    if (!confirm("Are you sure you want to delete this deployment?")) return;
    const res = await fetch(`/api/deployments/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchDeployments();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deployments</h1>
          <p className="mt-1 text-gray-600">
            Manage your self-hosted model containers
          </p>
        </div>
        <Link
          href="/dashboard/deployments/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          New Deployment
        </Link>
      </div>

      {loading ? (
        <div className="mt-8 flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : deployments.length === 0 ? (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-12 text-center">
          <Server className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No deployments yet
          </h3>
          <p className="mt-2 text-gray-600">
            Deploy your own models or bring a custom container image.
          </p>
          <Link
            href="/dashboard/deployments/new"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            Create your first deployment
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {deployments.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-gray-200 bg-white p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {d.name}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        statusColors[d.status] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {d.sourceType === "image"
                      ? `Image: ${d.sourceValue}`
                      : `Catalog: ${d.sourceValue}`}
                  </p>
                  <div className="mt-2 flex gap-4 text-sm text-gray-600">
                    <span>{d.cpu} CPU</span>
                    <span>{d.memoryGb} GB RAM</span>
                    <span>{d.replicas} replica{d.replicas !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {d.fqdn && d.status === "running" && (
                    <a
                      href={d.fqdn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      title="Open endpoint"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    onClick={() => toggleStatus(d)}
                    className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    title={d.status === "running" ? "Stop" : "Start"}
                  >
                    {d.status === "running" ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteDeployment(d.id)}
                    className="rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {d.status === "running" && (
                <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm">
                  <p className="font-medium text-gray-700">API Usage</p>
                  <code className="mt-1 block text-xs text-gray-600">
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
