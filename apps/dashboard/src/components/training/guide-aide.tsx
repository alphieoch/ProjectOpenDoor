"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  FlaskConical,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type { LibraryJob } from "@/components/training/library";
import {
  TRAINING_METHODS,
  type CatalogModel,
  type DatasetSummary,
  type FailureExplanation,
  type TrainerCapabilities,
  type TrainingPlan,
} from "@/lib/training/plan";

export const GOAL_CHIPS = [
  "Answer like our support team: concise, cite policy, no slang.",
  "Extract invoice fields as JSON from messy vendor emails.",
  "Prefer safer medical wording and refuse diagnosis.",
];

type Step = "goal" | "plan" | "data" | "train";
const STEPS: { id: Step; label: string }[] = [
  { id: "goal", label: "Goal" },
  { id: "plan", label: "Plan" },
  { id: "data", label: "Data" },
  { id: "train", label: "Train" },
];

export type PlanEdits = Partial<{
  jobName: string;
  baseModelId: string;
  method: string;
  adapter: string;
  datasetId: string | null;
  epochs: number;
  learning_rate: number;
  batch_size: number;
  lora_rank: number;
}>;

export type LaunchReady = {
  ok: boolean;
  blockers: TrainingPlan["blockers"];
};

export function trainerLabel(cap: TrainerCapabilities) {
  if (cap.together) return "Together fine-tunes are configured.";
  if (cap.vertex) return "Vertex is the trainer (Gemini/Gemma SFT, CustomJob otherwise).";
  if (cap.simulated) return "Local/dev simulator only — not a GPU cluster.";
  return "No trainer configured yet. You can still plan and upload data.";
}

export function statusTone(status: string) {
  if (status === "succeeded") return "text-foreground";
  if (status === "failed" || status === "cancelled") return "text-destructive";
  return "text-muted-foreground";
}

export function TrainingAide({
  mode,
  catalog,
  datasets,
  plan,
  goal,
  setGoal,
  planSource,
  planNote,
  ready,
  saving,
  watching,
  explanation,
  explaining,
  setCancelOpen,
  step,
  setStep,
  onPropose,
  onEdit,
  onUpload,
  dsName,
  setDsName,
  dsBody,
  setDsBody,
  onLaunch,
  onRetry,
  onExplain,
  onPickChip,
}: {
  mode: "wizard" | "panel";
  catalog: CatalogModel[];
  datasets: DatasetSummary[];
  plan: TrainingPlan | null;
  goal: string;
  setGoal: (v: string) => void;
  planSource: "ai" | "heuristic" | null;
  planNote: string | null;
  ready: LaunchReady | null;
  saving: boolean;
  watching: LibraryJob | null;
  explanation: FailureExplanation | null;
  explaining: boolean;
  setCancelOpen: (v: boolean) => void;
  step: Step;
  setStep: (s: Step) => void;
  onPropose: () => void;
  onEdit: (edits: PlanEdits) => void;
  onUpload: (ev: FormEvent) => void;
  dsName: string;
  setDsName: (v: string) => void;
  dsBody: string;
  setDsBody: (v: string) => void;
  onLaunch: () => void;
  onRetry: () => void;
  onExplain: (job: LibraryJob) => void;
  onPickChip?: (chip: string) => void;
}) {
  return (
    <div className={mode === "panel" ? "space-y-4" : "space-y-6"}>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Aide</p>
        <p className="mt-1 text-sm text-foreground">Advanced method</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Catalog pickers, hyperparameters, and the stepper. Chat is the easier path.
        </p>
      </div>

      {mode === "wizard" ? (
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => {
            const active = step === s.id;
            const done = STEPS.findIndex((x) => x.id === step) > i;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <span className="flex size-5 items-center justify-center rounded-full border border-current text-[11px]">
                    {done ? <Check className="size-3" /> : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      {mode === "wizard" && step === "goal" ? (
        <GoalFields
          goal={goal}
          setGoal={setGoal}
          saving={saving}
          onPropose={onPropose}
          onPickChip={onPickChip}
        />
      ) : null}

      {mode === "wizard" && step === "plan" && !plan ? (
        <p className="text-sm text-muted-foreground">Propose a plan from chat or the goal step first.</p>
      ) : null}

      {mode === "wizard" && step === "plan" && plan ? (
        <section className="space-y-4">
          <PlanKnobs
            plan={plan}
            catalog={catalog}
            planSource={planSource}
            planNote={planNote}
            onEdit={onEdit}
          />
          <Blockers blockers={plan.blockers} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep("goal")}>
              Back
            </button>
            <button type="button" className="btn-primary" onClick={() => setStep("data")}>
              Attach data <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      ) : null}

      {mode === "wizard" && step === "data" && !plan ? (
        <p className="text-sm text-muted-foreground">Propose a plan first so we know which columns to ask for.</p>
      ) : null}

      {mode === "wizard" && step === "data" && plan ? (
        <DatasetFields
          plan={plan}
          datasets={datasets}
          dsName={dsName}
          setDsName={setDsName}
          dsBody={dsBody}
          setDsBody={setDsBody}
          saving={saving}
          onUpload={onUpload}
          onEdit={onEdit}
          footer={
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setStep("plan")}>
                Back
              </button>
              <button type="button" className="btn-primary" onClick={() => setStep("train")}>
                Review & launch <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          }
        />
      ) : null}

      {mode === "wizard" && step === "train" ? (
        <LaunchFields
          plan={plan}
          datasets={datasets}
          ready={ready}
          saving={saving}
          watching={watching}
          explanation={explanation}
          explaining={explaining}
          setCancelOpen={setCancelOpen}
          onLaunch={onLaunch}
          onRetry={onRetry}
          onExplain={onExplain}
          onBack={() => setStep("data")}
        />
      ) : null}

      {mode === "panel" ? (
        <div className="space-y-4">
          {!plan ? (
            <GoalFields
              goal={goal}
              setGoal={setGoal}
              saving={saving}
              onPropose={onPropose}
              onPickChip={onPickChip}
              compact
            />
          ) : (
            <>
              <PlanKnobs
                plan={plan}
                catalog={catalog}
                planSource={planSource}
                planNote={planNote}
                onEdit={onEdit}
                compact
              />
              <DatasetFields
                plan={plan}
                datasets={datasets}
                dsName={dsName}
                setDsName={setDsName}
                dsBody={dsBody}
                setDsBody={setDsBody}
                saving={saving}
                onUpload={onUpload}
                onEdit={onEdit}
                compact
              />
              <LaunchFields
                plan={plan}
                datasets={datasets}
                ready={ready}
                saving={saving}
                watching={watching}
                explanation={explanation}
                explaining={explaining}
                setCancelOpen={setCancelOpen}
                onLaunch={onLaunch}
                onRetry={onRetry}
                onExplain={onExplain}
                compact
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GoalFields({
  goal,
  setGoal,
  saving,
  onPropose,
  onPickChip,
  compact,
}: {
  goal: string;
  setGoal: (v: string) => void;
  saving: boolean;
  onPropose: () => void;
  onPickChip?: (chip: string) => void;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "space-y-3" : "card space-y-4 p-5"}>
      <div>
        <p className="text-sm font-medium text-foreground">What should this model be good at?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Or ask in chat — this field is the same goal the planner uses.
        </p>
      </div>
      <textarea
        className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        placeholder="e.g. Sound like our EU support desk: short answers, cite the refund policy, never invent SKUs."
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {GOAL_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => (onPickChip ? onPickChip(chip) : setGoal(chip))}
          >
            {chip}
          </button>
        ))}
      </div>
      <button type="button" className="btn-primary" disabled={saving} onClick={onPropose}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Propose a plan
      </button>
    </section>
  );
}

function PlanKnobs({
  plan,
  catalog,
  planSource,
  planNote,
  onEdit,
  compact,
}: {
  plan: TrainingPlan;
  catalog: CatalogModel[];
  planSource: "ai" | "heuristic" | null;
  planNote: string | null;
  onEdit: (edits: PlanEdits) => void;
  compact?: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  return (
    <div className={compact ? "space-y-3" : "card space-y-4 p-5"}>
      <div>
        <p className="text-sm font-medium text-foreground">{plan.jobName}</p>
        <p className="mt-1 text-sm text-muted-foreground">{plan.summary}</p>
        {planSource ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {planSource === "ai" ? "Proposed by the house chat model." : "Catalog rules (planner fallback)."}
            {planNote ? ` ${planNote}` : ""}
          </p>
        ) : null}
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Base model</span>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          value={plan.baseModelId}
          onChange={(e) => onEdit({ baseModelId: e.target.value })}
        >
          {!plan.baseModelId ? <option value="">No trainable catalog model</option> : null}
          {catalog.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || m.id}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Method</span>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={plan.method}
            onChange={(e) => onEdit({ method: e.target.value })}
          >
            {TRAINING_METHODS.map((m) => (
              <option key={m} value={m}>
                {m.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Adapter</span>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={plan.adapter}
            onChange={(e) => onEdit({ adapter: e.target.value })}
          >
            <option value="lora">LoRA</option>
            <option value="full">Full</option>
          </select>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">{plan.honesty}</p>

      {plan.evalCriteria.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {plan.evalCriteria.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setAdvanced((v) => !v)}
      >
        <ChevronDown className={`h-4 w-4 transition ${advanced ? "rotate-180" : ""}`} />
        Advanced hyperparameters
      </button>
      {advanced ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-muted-foreground">
            Epochs
            <input
              type="number"
              min={1}
              max={10}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={plan.hyperparameters.epochs}
              onChange={(e) => onEdit({ epochs: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm text-muted-foreground">
            Learning rate
            <input
              type="number"
              step="0.00001"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={plan.hyperparameters.learning_rate}
              onChange={(e) => onEdit({ learning_rate: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm text-muted-foreground">
            Batch size
            <input
              type="number"
              min={1}
              max={32}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={plan.hyperparameters.batch_size}
              onChange={(e) => onEdit({ batch_size: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm text-muted-foreground">
            LoRA rank
            <input
              type="number"
              min={1}
              max={32}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={plan.hyperparameters.lora_rank}
              onChange={(e) => onEdit({ lora_rank: Number(e.target.value) })}
            />
          </label>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {plan.hyperparameters.epochs} epochs · lr {plan.hyperparameters.learning_rate} · batch{" "}
          {plan.hyperparameters.batch_size}
          {plan.adapter === "lora" ? ` · rank ${plan.hyperparameters.lora_rank}` : ""}
        </p>
      )}
    </div>
  );
}

function DatasetFields({
  plan,
  datasets,
  dsName,
  setDsName,
  dsBody,
  setDsBody,
  saving,
  onUpload,
  onEdit,
  footer,
  compact,
}: {
  plan: TrainingPlan;
  datasets: DatasetSummary[];
  dsName: string;
  setDsName: (v: string) => void;
  dsBody: string;
  setDsBody: (v: string) => void;
  saving: boolean;
  onUpload: (ev: FormEvent) => void;
  onEdit: (edits: PlanEdits) => void;
  footer?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "space-y-3" : "grid gap-6 lg:grid-cols-2"}>
      <form onSubmit={onUpload} className={compact ? "space-y-2" : "card space-y-3 p-5"}>
        <p className="text-sm font-medium text-foreground">Upload examples</p>
        <p className="text-xs text-muted-foreground">
          Columns: {plan.datasetShape.suggestedColumns.join(", ")}. Aim for {plan.datasetShape.minRows}+ rows.
        </p>
        {plan.datasetShape.warning ? (
          <p className="text-xs text-destructive">{plan.datasetShape.warning}</p>
        ) : null}
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          placeholder="Dataset name"
          value={dsName}
          onChange={(e) => setDsName(e.target.value)}
        />
        <textarea
          className="h-32 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
          placeholder={JSON.stringify(plan.datasetShape.exampleRow, null, 2)}
          value={dsBody}
          onChange={(e) => setDsBody(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save dataset
        </button>
      </form>
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Or pick an existing set</p>
        {datasets.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet — paste JSON/JSONL or attach a file in chat.</p>
        ) : null}
        {datasets.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onEdit({ datasetId: d.id })}
            className={`w-full rounded-lg border p-3 text-left text-sm ${
              plan.datasetId === d.id ? "border-primary bg-primary/10" : "border-border bg-card"
            }`}
          >
            <p className="font-medium text-foreground">{d.name}</p>
            <p className="text-xs text-muted-foreground">
              {d.purpose} · {d.rowCount} rows
            </p>
          </button>
        ))}
        {footer}
      </div>
    </section>
  );
}

function LaunchFields({
  plan,
  datasets,
  ready,
  saving,
  watching,
  explanation,
  explaining,
  setCancelOpen,
  onLaunch,
  onRetry,
  onExplain,
  onBack,
  compact,
}: {
  plan: TrainingPlan | null;
  datasets: DatasetSummary[];
  ready: LaunchReady | null;
  saving: boolean;
  watching: LibraryJob | null;
  explanation: FailureExplanation | null;
  explaining: boolean;
  setCancelOpen: (v: boolean) => void;
  onLaunch: () => void;
  onRetry: () => void;
  onExplain: (job: LibraryJob) => void;
  onBack?: () => void;
  compact?: boolean;
}) {
  return (
    <section className="space-y-4">
      {plan ? (
        <div className={compact ? "space-y-3" : "card space-y-3 p-5"}>
          <p className="text-sm font-medium text-foreground">Launch</p>
          <p className="text-sm text-muted-foreground">
            {plan.jobName} · {plan.method.toUpperCase()} / {plan.adapter} ·{" "}
            {plan.baseModelLabel || plan.baseModelId || "no base"}
            {plan.datasetId
              ? ` · dataset ${datasets.find((d) => d.id === plan.datasetId)?.name || plan.datasetId}`
              : " · no dataset"}
          </p>
          {ready && !ready.ok ? <Blockers blockers={ready.blockers} /> : null}
          <div className="flex flex-wrap gap-2">
            {onBack ? (
              <button type="button" className="btn-ghost" onClick={onBack}>
                Back
              </button>
            ) : null}
            <button type="button" className="btn-primary" disabled={saving || !ready?.ok} onClick={onLaunch}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Start fine-tune
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Propose a plan, then launch. Existing jobs still appear below.</p>
      )}

      {watching ? (
        <JobStatus
          job={watching}
          saving={saving}
          explanation={explanation}
          explaining={explaining}
          onRetry={onRetry}
          onExplain={() => onExplain(watching)}
          onCancel={() => setCancelOpen(true)}
        />
      ) : null}
    </section>
  );
}

export function JobStatus({
  job,
  saving,
  explanation,
  explaining,
  onRetry,
  onExplain,
  onCancel,
}: {
  job: LibraryJob;
  saving: boolean;
  explanation: FailureExplanation | null;
  explaining: boolean;
  onRetry: () => void;
  onExplain: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{job.name}</p>
          <p className={`text-xs ${statusTone(job.status)}`}>{job.status}</p>
        </div>
        <div className="flex gap-2">
          {job.status === "failed" || job.status === "cancelled" ? (
            <button type="button" className="btn-secondary btn-sm" disabled={saving} onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </button>
          ) : null}
          {job.status === "queued" || job.status === "running" ? (
            <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>
      <div className="h-1.5 rounded bg-muted">
        <div className="h-1.5 rounded bg-primary" style={{ width: `${job.progressPercent || 0}%` }} />
      </div>
      {job.statusMessage ? <p className="text-xs text-muted-foreground">{job.statusMessage}</p> : null}
      {job.outputModelId ? (
        <code className="block text-xs text-foreground">model: &quot;{job.outputModelId}&quot;</code>
      ) : null}
      {job.status === "failed" ? (
        <div className="rounded-md border border-border bg-background p-3 text-sm">
          {explaining && !explanation ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Explaining the failure…
            </p>
          ) : null}
          {explanation ? (
            <>
              <p className="font-medium text-foreground">{explanation.headline}</p>
              <p className="mt-1 text-muted-foreground">{explanation.detail}</p>
              <p className="mt-2 text-foreground">{explanation.nextAction.label}</p>
            </>
          ) : (
            <button type="button" className="btn-secondary btn-sm" onClick={onExplain}>
              Explain this failure
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Blockers({ blockers }: { blockers: TrainingPlan["blockers"] }) {
  if (!blockers.length) return null;
  return (
    <ul className="space-y-2">
      {blockers.map((b) => (
        <li
          key={b.code}
          className="flex gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <AlertTriangle
            className={`mt-0.5 h-4 w-4 shrink-0 ${b.severity === "block" ? "text-destructive" : "text-muted-foreground"}`}
          />
          <div>
            <p className="text-foreground">{b.message}</p>
            <p className="text-muted-foreground">Next: {b.nextAction}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
