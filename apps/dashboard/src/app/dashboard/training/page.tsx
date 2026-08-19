"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface Dataset {
  id: string;
  name: string;
  slug: string;
  purpose: string;
  rowCount: number;
  status: string;
}

interface Job {
  id: string;
  name: string;
  method: string;
  baseModelId: string;
  outputModelId?: string | null;
  status: string;
  progressPercent: number;
  statusMessage?: string | null;
}

interface FtModel {
  id: string;
  modelId: string;
  displayName: string;
  baseModelId: string;
  billAsBase: boolean;
}

interface EvalJob {
  id: string;
  modelId: string;
  status: string;
  score?: string | null;
  statusMessage?: string | null;
}

export default function TrainingPage() {
  const [tab, setTab] = useState<"datasets" | "jobs" | "models" | "evals">("datasets");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [models, setModels] = useState<FtModel[]>([]);
  const [evals, setEvals] = useState<EvalJob[]>([]);
  const [loading, setLoading] = useState(true);

  const [dsName, setDsName] = useState("");
  const [dsPurpose, setDsPurpose] = useState("sft");
  const [dsJsonl, setDsJsonl] = useState(
    '[{"messages":[{"role":"user","content":"Hi"},{"role":"assistant","content":"Hello!"}]}]'
  );

  const [jobName, setJobName] = useState("");
  const [jobMethod, setJobMethod] = useState("sft");
  const [jobBase, setJobBase] = useState("gemini-2.5-flash");
  const [jobDataset, setJobDataset] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const [d, j, m, e] = await Promise.all([
      fetch("/api/training/datasets"),
      fetch("/api/training/jobs"),
      fetch("/api/training/models"),
      fetch("/api/training/evals"),
    ]);
    if (d.ok) setDatasets((await d.json()).datasets || []);
    if (j.ok) setJobs((await j.json()).jobs || []);
    if (m.ok) setModels((await m.json()).models || []);
    if (e.ok) setEvals((await e.json()).jobs || []);
    if (!d.ok || !j.ok || !m.ok || !e.ok) {
      setError("Training APIs failed to load. Refresh once — tables may have just been created.");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function createDataset(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    let rows: unknown[] = [];
    try {
      rows = JSON.parse(dsJsonl);
      if (!Array.isArray(rows)) throw new Error("must be array");
    } catch {
      alert("JSONL body must be a JSON array of records");
      setSaving(false);
      return;
    }
    const res = await fetch("/api/training/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: dsName, purpose: dsPurpose, rows }),
    });
    if (!res.ok) alert((await res.json()).error || "Failed");
    else {
      setDsName("");
    }
    setSaving(false);
    await load();
  }

  async function createJob(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    const res = await fetch("/api/training/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: jobName,
        method: jobMethod,
        baseModelId: jobBase,
        datasetId: jobDataset || undefined,
        lora: true,
      }),
    });
    if (!res.ok) alert((await res.json()).error || "Failed");
    else {
      setJobName("");
      setTab("jobs");
    }
    setSaving(false);
    await load();
  }

  async function runEval() {
    if (!models[0] && !jobBase) return;
    setSaving(true);
    const res = await fetch("/api/training/evals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: models[0]?.modelId || jobBase,
        datasetId: datasets[0]?.id,
        kind: "llm_judge",
        name: "Default judge",
      }),
    });
    if (!res.ok) alert((await res.json()).error || "Failed");
    setSaving(false);
    setTab("evals");
    await load();
  }

  async function deleteDataset(id: string) {
    if (!confirm("Delete dataset?")) return;
    await fetch(`/api/training/datasets/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Training"
        title="Fine-tunes"
        description="Vertex AI is the primary trainer (supervised tuning for Gemini/Gemma SFT, CustomJob otherwise). Together is optional. Production does not mint simulated ft: models."
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {(["datasets", "jobs", "models", "evals"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
              tab === t ? "border-primary-600 bg-primary-50" : "border-gray-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error ? (
        <div className="alert-error mt-4 text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
        </div>
      ) : (
        <div className="mt-6">
          {tab === "datasets" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <form onSubmit={createDataset} className="card space-y-3 p-4">
                <p className="font-medium text-sm">New dataset</p>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Name"
                  value={dsName}
                  onChange={(e) => setDsName(e.target.value)}
                  required
                />
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={dsPurpose}
                  onChange={(e) => setDsPurpose(e.target.value)}
                >
                  <option value="sft">SFT</option>
                  <option value="dpo">DPO</option>
                  <option value="orpo">ORPO</option>
                  <option value="eval">Eval</option>
                </select>
                <textarea
                  className="h-40 w-full rounded-md border px-3 py-2 font-mono text-xs"
                  value={dsJsonl}
                  onChange={(e) => setDsJsonl(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={saving}>
                  <Plus className="h-4 w-4" /> Upload
                </button>
              </form>
              <div className="space-y-2">
                {datasets.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-gray-500">
                        {d.purpose} · {d.rowCount} rows · {d.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      onClick={() => deleteDataset(d.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "jobs" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <form onSubmit={createJob} className="card space-y-3 p-4">
                <p className="font-medium text-sm">Start training job</p>
                <p className="text-xs text-gray-500">
                  Vertex supervised tuning for Gemini/Gemma SFT. Other methods need a CustomJob image. Together is optional.
                </p>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Job name"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  required
                />
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={jobMethod}
                  onChange={(e) => setJobMethod(e.target.value)}
                >
                  <option value="sft">SFT (LoRA)</option>
                  <option value="dpo">DPO</option>
                  <option value="orpo">ORPO</option>
                  <option value="rft">RFT</option>
                  <option value="grpo">GRPO</option>
                </select>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Base model id"
                  value={jobBase}
                  onChange={(e) => setJobBase(e.target.value)}
                  required
                />
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={jobDataset}
                  onChange={(e) => setJobDataset(e.target.value)}
                >
                  <option value="">No dataset</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-primary" disabled={saving}>
                  <FlaskConical className="h-4 w-4" /> Start
                </button>
              </form>
              <div className="space-y-2">
                {jobs.length === 0 && (
                  <p className="text-sm text-gray-500">
                    No jobs yet. Vertex AI (GCP project + ADC) is the primary trainer; Together is optional.
                  </p>
                )}
                {jobs.map((j) => (
                  <div key={j.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between">
                      <p className="font-medium">{j.name}</p>
                      <span className="text-xs">{j.status}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {j.method} · {j.baseModelId}
                    </p>
                    <div className="mt-2 h-1.5 rounded bg-gray-100">
                      <div
                        className="h-1.5 rounded bg-primary-600"
                        style={{ width: `${j.progressPercent}%` }}
                      />
                    </div>
                    {j.outputModelId && (
                      <code className="mt-2 block text-xs">model: &quot;{j.outputModelId}&quot;</code>
                    )}
                    {j.statusMessage && (
                      <p className="mt-1 text-xs text-gray-500">{j.statusMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "models" && (
            <div className="space-y-2">
              {models.length === 0 ? (
                <p className="text-sm text-gray-500">No fine-tunes yet — run a job.</p>
              ) : (
                models.map((m) => (
                  <div key={m.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{m.displayName}</p>
                    <code className="text-xs">{m.modelId}</code>
                    <p className="mt-1 text-xs text-gray-500">
                      Base {m.baseModelId}
                      {m.billAsBase ? " · billed at base price" : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "evals" && (
            <div className="space-y-4">
              <button type="button" className="btn-primary" onClick={runEval} disabled={saving}>
                Run eval on latest model
              </button>
              {evals.map((e) => (
                <div key={e.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{e.modelId}</p>
                  <p className="text-xs text-gray-500">
                    {e.status}
                    {e.score != null ? ` · score ${e.score}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
