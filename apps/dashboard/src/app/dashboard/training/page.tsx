"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TrainingGuide } from "@/components/training/guide";
import { TrainingLibrary, type LibraryEval, type LibraryJob, type LibraryModel } from "@/components/training/library";
import {
  emptyCapabilities,
  type CatalogModel,
  type DatasetSummary,
  type TrainerCapabilities,
} from "@/lib/training/plan";

type View = "guide" | "aide" | "library";

export default function TrainingPage() {
  const [view, setView] = useState<View>("guide");
  const [capabilities, setCapabilities] = useState<TrainerCapabilities>(emptyCapabilities());
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [jobs, setJobs] = useState<LibraryJob[]>([]);
  const [models, setModels] = useState<LibraryModel[]>([]);
  const [evals, setEvals] = useState<LibraryEval[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [planRes, jobsRes, modelsRes, evalsRes] = await Promise.all([
      fetch("/api/training/plan"),
      fetch("/api/training/jobs"),
      fetch("/api/training/models"),
      fetch("/api/training/evals"),
    ]);
    if (planRes.ok) {
      const data = await planRes.json();
      setCapabilities(data.capabilities || emptyCapabilities());
      setCatalog(data.catalog || []);
      setDatasets(data.datasets || []);
    }
    if (jobsRes.ok) setJobs((await jobsRes.json()).jobs || []);
    if (modelsRes.ok) setModels((await modelsRes.json()).models || []);
    if (evalsRes.ok) setEvals((await evalsRes.json()).jobs || []);
    if (!planRes.ok || !jobsRes.ok || !modelsRes.ok || !evalsRes.ok) {
      setError("Training APIs failed to load. Refresh once — tables may have just been created.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <PageHeader
        className="shrink-0"
        eyebrow="Training"
        title="Fine-tunes"
        description="Chat with the planner for a catalog base and method. Aide keeps the stepper and raw knobs. Library is datasets, jobs, models, and evals."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={view === "guide" ? "btn-primary" : "btn-secondary"}
              onClick={() => setView("guide")}
            >
              Guide
            </button>
            <button
              type="button"
              className={view === "aide" ? "btn-primary" : "btn-secondary"}
              onClick={() => setView("aide")}
            >
              Aide
            </button>
            <button
              type="button"
              className={view === "library" ? "btn-primary" : "btn-secondary"}
              onClick={() => setView("library")}
            >
              Library
            </button>
          </div>
        }
      />

      {error ? (
        <div className="alert-error mb-4 shrink-0 text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className={`flex min-h-0 flex-1 flex-col ${view === "library" ? "hidden" : ""}`}>
            <TrainingGuide
              layout={view === "aide" ? "aide" : "chat"}
              capabilities={capabilities}
              catalog={catalog}
              datasets={datasets}
              jobs={jobs}
              saving={saving}
              setSaving={setSaving}
              onRefresh={load}
            />
          </div>
          {view === "library" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <TrainingLibrary
                datasets={datasets}
                jobs={jobs}
                models={models}
                evals={evals}
                catalog={catalog}
                saving={saving}
                onRefresh={load}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
