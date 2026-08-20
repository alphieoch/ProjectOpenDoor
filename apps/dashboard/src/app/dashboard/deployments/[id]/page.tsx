"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface Lora {
  id: string;
  name: string;
  adapterUri: string;
  status: string;
  metadata?: { detail?: string } | null;
}

interface Deployment {
  id: string;
  name: string;
  status: string;
  target?: string;
  fqdn: string | null;
  precision?: string | null;
  weightsUri?: string | null;
  minReplicas?: number;
  maxReplicas?: number;
  scaleToZero?: boolean;
  reserved?: boolean;
}

export default function DeploymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loras, setLoras] = useState<Lora[]>([]);
  const [loading, setLoading] = useState(true);
  const [loraName, setLoraName] = useState("");
  const [adapterUri, setAdapterUri] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/deployments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDeployment(data.deployment);
      setLoras(data.loras || []);
    } else if (res.status === 404) {
      router.push("/dashboard/deployments");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function addLora(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/deployments/${id}/loras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: loraName, adapterUri }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || data.detail || "Failed to load LoRA");
    }
    setLoraName("");
    setAdapterUri("");
    setSaving(false);
    await load();
  }

  async function removeLora(loraId: string) {
    if (!confirm("Unload and remove this LoRA?")) return;
    await fetch(`/api/deployments/${id}/loras/${loraId}`, { method: "DELETE" });
    await load();
  }

  if (loading || !deployment) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/dashboard/deployments"
        className="mb-4 inline-flex items-center gap-1 text-sm"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <PageHeader
        eyebrow="Dedicated"
        title={deployment.name}
        description={`Call as custom:${deployment.id}${
          deployment.fqdn && deployment.sourceType !== "image"
            ? ` · ${deployment.fqdn}`
            : ""
        }`}
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-4 text-sm space-y-2">
          <p className="font-medium" style={{ color: "hsl(var(--foreground))" }}>Fleet</p>
          <p style={{ color: "hsl(var(--muted-foreground))" }}>Status: {deployment.status}</p>
          <p style={{ color: "hsl(var(--muted-foreground))" }}>
            Target: {deployment.target} · precision {deployment.precision || "fp16"}
          </p>
          <p style={{ color: "hsl(var(--muted-foreground))" }}>
            Replicas min/max: {deployment.minReplicas ?? 0}/{deployment.maxReplicas ?? 1}
            {deployment.scaleToZero ? " · scale-to-zero" : ""}
            {deployment.reserved ? " · reserved" : ""}
          </p>
          {deployment.weightsUri && (
            <p style={{ color: "hsl(var(--muted-foreground))" }}>Weights: {deployment.weightsUri}</p>
          )}
          <code className="block text-xs mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
            model: &quot;custom:{deployment.id}&quot;
          </code>
        </div>

        <div className="card p-4">
          <p className="font-medium text-sm" style={{ color: "hsl(var(--foreground))" }}>
            Load LoRA adapter
          </p>
          <p className="mt-1 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            GCP / vLLM only. Then call <code>custom:{id}/&lt;name&gt;</code>.
          </p>
          <form onSubmit={addLora} className="mt-3 space-y-2">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="adapter name (e.g. support-v1)"
              value={loraName}
              onChange={(e) => setLoraName(e.target.value)}
              required
            />
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="HF repo or path (e.g. org/adapter)"
              value={adapterUri}
              onChange={(e) => setAdapterUri(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Load LoRA
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
          Loaded adapters
        </h2>
        {loras.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            No LoRAs yet.
          </p>
        ) : (
          <div className="mt-3 grid gap-2">
            {loras.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                <div>
                  <p style={{ color: "hsl(var(--foreground))" }}>
                    {l.name} · <span className="text-xs">{l.status}</span>
                  </p>
                  <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {l.adapterUri}
                  </p>
                  {l.status === "loaded" && (
                    <code className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      custom:{id}/{l.name}
                    </code>
                  )}
                  {l.metadata?.detail && (
                    <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {l.metadata.detail}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => removeLora(l.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
