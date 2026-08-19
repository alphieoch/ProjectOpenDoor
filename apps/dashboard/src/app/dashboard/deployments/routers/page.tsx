"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2, GitBranch } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface Deployment {
  id: string;
  name: string;
  status: string;
}

interface RouterTarget {
  id: string;
  deploymentId: string;
  weight: number;
  deployment?: { id: string; name: string; status: string } | null;
}

interface Router {
  id: string;
  name: string;
  slug: string;
  status: string;
  modelId: string;
  targets: RouterTarget[];
}

export default function DeploymentRoutersPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [aWeight, setAWeight] = useState(50);
  const [bWeight, setBWeight] = useState(50);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [rRes, dRes] = await Promise.all([
      fetch("/api/deployment-routers"),
      fetch("/api/deployments"),
    ]);
    if (rRes.ok) {
      const data = await rRes.json();
      setRouters(data.routers || []);
    }
    if (dRes.ok) {
      const data = await dRes.json();
      const running = (data.deployments || []).filter(
        (d: Deployment) => d.status === "running"
      );
      setDeployments(running);
      if (running[0]) setAId(running[0].id);
      if (running[1]) setBId(running[1].id);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createRouter(e: React.FormEvent) {
    e.preventDefault();
    if (!aId || !bId || aId === bId) {
      alert("Pick two different running deployments");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/deployment-routers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug: slug || undefined,
        targets: [
          { deploymentId: aId, weight: aWeight },
          { deploymentId: bId, weight: bWeight },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Failed");
    else {
      setName("");
      setSlug("");
    }
    setSaving(false);
    await load();
  }

  async function removeRouter(id: string) {
    if (!confirm("Delete this router?")) return;
    await fetch(`/api/deployment-routers/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Dedicated"
        title="Deployment routers"
        description="A/B traffic split across running GPUs. Call model router:&lt;slug&gt;."
        actions={
          <Link href="/dashboard/deployments" className="btn-ghost">
            All deployments
          </Link>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
        </div>
      ) : (
        <>
          <form onSubmit={createRouter} className="card mt-6 max-w-xl space-y-3 p-4">
            <p className="font-medium text-sm" style={{ color: "hsl(var(--foreground))" }}>
              New A/B router
            </p>
            {deployments.length < 2 ? (
              <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                Need at least two running deployments.{" "}
                <Link href="/dashboard/deployments/new" className="underline">
                  Request GPU
                </Link>
              </p>
            ) : (
              <>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Router name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="slug (optional)"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs space-y-1">
                    Variant A
                    <select
                      className="w-full rounded-md border px-2 py-2 text-sm"
                      value={aId}
                      onChange={(e) => setAId(e.target.value)}
                    >
                      {deployments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-md border px-2 py-1 text-sm"
                      value={aWeight}
                      onChange={(e) => setAWeight(Number(e.target.value))}
                    />
                  </label>
                  <label className="text-xs space-y-1">
                    Variant B
                    <select
                      className="w-full rounded-md border px-2 py-2 text-sm"
                      value={bId}
                      onChange={(e) => setBId(e.target.value)}
                    >
                      {deployments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-md border px-2 py-1 text-sm"
                      value={bWeight}
                      onChange={(e) => setBWeight(Number(e.target.value))}
                    />
                  </label>
                </div>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Create router
                </button>
              </>
            )}
          </form>

          <div className="mt-8 grid gap-3">
            {routers.length === 0 ? (
              <div className="card p-10 text-center">
                <GitBranch className="mx-auto h-8 w-8" style={{ color: "hsl(var(--muted-foreground))" }} />
                <p className="mt-3 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  No routers yet.
                </p>
              </div>
            ) : (
              routers.map((r) => (
                <div key={r.id} className="card p-4 flex justify-between gap-4">
                  <div>
                    <p className="font-medium" style={{ color: "hsl(var(--foreground))" }}>
                      {r.name}
                    </p>
                    <code className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {r.modelId}
                    </code>
                    <ul className="mt-2 text-sm space-y-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {r.targets.map((t) => (
                        <li key={t.id}>
                          weight {t.weight} → {t.deployment?.name || t.deploymentId} (
                          {t.deployment?.status || "?"})
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    className="btn-danger btn-sm h-fit"
                    onClick={() => removeRouter(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
