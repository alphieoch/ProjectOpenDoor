"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Loader2, Plus, Trash2 } from "lucide-react";
import { ConfirmDeleteDatasetDialog } from "@/components/training/dialogs";
import { parseDatasetRows } from "@/lib/training/plan";
import type { CatalogModel, DatasetSummary } from "@/lib/training/plan";

export type LibraryJob = {
  id: string;
  name: string;
  method: string;
  baseModelId: string;
  outputModelId?: string | null;
  status: string;
  progressPercent: number;
  statusMessage?: string | null;
};

export type LibraryModel = {
  id: string;
  modelId: string;
  displayName: string;
  baseModelId: string;
  billAsBase: boolean;
};

export type LibraryEval = {
  id: string;
  modelId: string;
  status: string;
  score?: string | null;
  statusMessage?: string | null;
};

type Tab = "datasets" | "jobs" | "models" | "evals";

export function TrainingLibrary({
  datasets,
  jobs,
  models,
  evals,
  catalog,
  saving,
  onRefresh,
}: {
  datasets: DatasetSummary[];
  jobs: LibraryJob[];
  models: LibraryModel[];
  evals: LibraryEval[];
  catalog: CatalogModel[];
  saving: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("jobs");
  const [dsName, setDsName] = useState("");
  const [dsPurpose, setDsPurpose] = useState("sft");
  const [dsJsonl, setDsJsonl] = useState(
    '[{"messages":[{"role":"user","content":"Hi"},{"role":"assistant","content":"Hello!"}]}]'
  );
  const [jobName, setJobName] = useState("");
  const [jobMethod, setJobMethod] = useState("sft");
  const [jobBase, setJobBase] = useState(catalog[0]?.id || "");

  useEffect(() => {
    if (!jobBase && catalog[0]?.id) setJobBase(catalog[0].id);
  }, [catalog, jobBase]);
  const [jobDataset, setJobDataset] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function createDataset(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    const parsed = parseDatasetRows(dsJsonl);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    const res = await fetch("/api/training/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: dsName, purpose: dsPurpose, rows: parsed.rows }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not upload the dataset.");
      return;
    }
    setDsName("");
    await onRefresh();
  }

  async function createJob(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not start the job.");
      return;
    }
    setJobName("");
    setTab("jobs");
    await onRefresh();
  }

  async function runEval() {
    setError(null);
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Eval failed — pick a finished model and a dataset first.");
      return;
    }
    setTab("evals");
    await onRefresh();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    const res = await fetch(`/api/training/datasets/${deleteId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not delete that dataset.");
    }
    setDeleting(false);
    setDeleteId(null);
    await onRefresh();
  }

  const pending = datasets.find((d) => d.id === deleteId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["datasets", "jobs", "models", "evals"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm capitalize ${
              tab === t
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error ? (
        <div className="alert-error text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {tab === "datasets" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={createDataset} className="card space-y-3 p-4">
            <p className="text-sm font-medium text-foreground">New dataset</p>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              placeholder="Name"
              value={dsName}
              onChange={(e) => setDsName(e.target.value)}
              required
            />
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={dsPurpose}
              onChange={(e) => setDsPurpose(e.target.value)}
            >
              <option value="sft">SFT</option>
              <option value="dpo">DPO</option>
              <option value="orpo">ORPO</option>
              <option value="eval">Eval</option>
            </select>
            <textarea
              className="h-40 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
              value={dsJsonl}
              onChange={(e) => setDsJsonl(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={saving}>
              <Plus className="h-4 w-4" /> Upload
            </button>
          </form>
          <div className="space-y-2">
            {datasets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No datasets yet. Upload JSONL rows or a JSON array.</p>
            ) : null}
            {datasets.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.purpose} · {d.rowCount} rows · {d.status || "ready"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => setDeleteId(d.id)}
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
            <p className="text-sm font-medium text-foreground">Start training job</p>
            <p className="text-xs text-muted-foreground">
              Same APIs as the guide. Prefer the guide unless you already know the ids.
            </p>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              placeholder="Job name"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              required
            />
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={jobMethod}
              onChange={(e) => setJobMethod(e.target.value)}
            >
              <option value="sft">SFT (LoRA)</option>
              <option value="dpo">DPO</option>
              <option value="orpo">ORPO</option>
              <option value="rft">RFT</option>
              <option value="grpo">GRPO</option>
            </select>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={jobBase}
              onChange={(e) => setJobBase(e.target.value)}
              required
            >
              <option value="">Base model</option>
              {catalog.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label || m.id}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
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
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet. Use the guide to pick a plan, then launch.</p>
            ) : null}
            {jobs.map((j) => (
              <div key={j.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-medium text-foreground">{j.name}</p>
                  <span className="text-xs text-muted-foreground">{j.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {j.method} · {j.baseModelId}
                </p>
                <div className="mt-2 h-1.5 rounded bg-muted">
                  <div className="h-1.5 rounded bg-primary" style={{ width: `${j.progressPercent}%` }} />
                </div>
                {j.outputModelId ? (
                  <code className="mt-2 block text-xs text-foreground">model: &quot;{j.outputModelId}&quot;</code>
                ) : null}
                {j.statusMessage ? <p className="mt-1 text-xs text-muted-foreground">{j.statusMessage}</p> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "models" && (
        <div className="space-y-2">
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fine-tunes yet — finish a job in the guide.</p>
          ) : (
            models.map((m) => (
              <div key={m.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-medium text-foreground">{m.displayName}</p>
                <code className="text-xs text-muted-foreground">{m.modelId}</code>
                <p className="mt-1 text-xs text-muted-foreground">
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
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Run eval on latest model
          </button>
          {evals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No evals yet.</p>
          ) : null}
          {evals.map((e) => (
            <div key={e.id} className="rounded-lg border border-border bg-card p-3 text-sm">
              <p className="font-medium text-foreground">{e.modelId}</p>
              <p className="text-xs text-muted-foreground">
                {e.status}
                {e.score != null ? ` · score ${e.score}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteDatasetDialog
        open={Boolean(deleteId)}
        name={pending?.name || "this dataset"}
        busy={deleting}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
