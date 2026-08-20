"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUp, FlaskConical, Loader2, Paperclip, PanelRight, PanelRightClose } from "lucide-react";
import { ConfirmCancelJobDialog } from "@/components/training/dialogs";
import {
  Blockers,
  GOAL_CHIPS,
  JobStatus,
  TrainingAide,
  trainerLabel,
  type PlanEdits,
} from "@/components/training/guide-aide";
import type { LibraryJob } from "@/components/training/library";
import { cn } from "@/lib/utils";
import {
  PLANNER_OPENING,
  applyPlanEdits,
  formatPlannerReply,
  goalFromChatMessages,
  launchReadiness,
  parseDatasetRows,
  planToHyperparameters,
  plannerChatCards,
  type CatalogModel,
  type DatasetSummary,
  type FailureExplanation,
  type PlannerChatCard,
  type TrainerCapabilities,
  type TrainingPlan,
} from "@/lib/training/plan";

type AideStep = "goal" | "plan" | "data" | "train";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: PlannerChatCard[];
  jobId?: string;
};

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function welcomeMessage(): ChatMessage {
  return { id: "welcome", role: "assistant", content: PLANNER_OPENING };
}

export function TrainingGuide({
  layout = "chat",
  capabilities,
  catalog,
  datasets,
  jobs,
  saving,
  setSaving,
  onRefresh,
}: {
  layout?: "chat" | "aide";
  capabilities: TrainerCapabilities;
  catalog: CatalogModel[];
  datasets: DatasetSummary[];
  jobs: LibraryJob[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage()]);
  const [draft, setDraft] = useState("");
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [planSource, setPlanSource] = useState<"ai" | "heuristic" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dsName, setDsName] = useState("");
  const [dsBody, setDsBody] = useState("");
  const [pendingDatasetId, setPendingDatasetId] = useState<string | null>(null);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<FailureExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [aideStep, setAideStep] = useState<AideStep>("goal");
  const [aideColumn, setAideColumn] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const watching = jobs.find((j) => j.id === watchingId) || (!watchingId ? jobs[0] : null) || null;
  const ready = useMemo(
    () => (plan ? launchReadiness(plan, datasets, capabilities, catalog) : null),
    [plan, datasets, capabilities, catalog]
  );

  useEffect(() => {
    setPlan((prev) => {
      if (!prev) return prev;
      if (prev.datasetId && datasets.some((d) => d.id === prev.datasetId)) return prev;
      if (!datasets[0] || prev.datasetId === datasets[0].id) return prev;
      return applyPlanEdits(prev, { datasetId: datasets[0].id }, catalog, datasets, capabilities);
    });
  }, [datasets, catalog, capabilities]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, saving]);

  useEffect(() => {
    if (!watchingId || !watching || watching.status !== "failed" || explanation) return;
    void explain(watching);
    // Auto-explain the job we launched; ignore explain identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchingId, watching?.status]);

  function editPlan(edits: PlanEdits) {
    if (!plan) return;
    setPlan(applyPlanEdits(plan, edits, catalog, datasets, capabilities));
  }

  function applyPlanResult(
    next: TrainingPlan,
    extra: { source?: "ai" | "heuristic" | null; note?: string | null }
  ) {
    setPlan(next);
    setPlanNote(extra.note || null);
    setPlanSource(extra.source || null);
    setGoal(next.goal);
    if (next.datasetId) setPendingDatasetId(next.datasetId);
    const cards = plannerChatCards(next, launchReadiness(next, datasets, capabilities, catalog));
    return { content: formatPlannerReply(next, extra), cards };
  }

  async function requestPlan(goalText: string, datasetId?: string | null) {
    const text = goalText.trim();
    if (!text) {
      const message = "Describe the domain, tone, or evals you care about.";
      setError(message);
      return { ok: false as const, error: message };
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/training/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: text, datasetId: datasetId ?? pendingDatasetId ?? plan?.datasetId }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.status === 429) {
      const message = data.error || "Chat allowance exhausted. Try again after the window resets.";
      setError(message);
      return { ok: false as const, error: message };
    }
    if (!res.ok || !data.plan) {
      const message = data.error || "The planner could not run. Check the gateway, then retry.";
      setError(message);
      return { ok: false as const, error: message };
    }
    return { ok: true as const, ...applyPlanResult(data.plan as TrainingPlan, { source: data.source, note: data.note }) };
  }

  async function sendChat(text: string) {
    const content = text.trim();
    if (!content || saving) return;
    const userMsg: ChatMessage = { id: newId(), role: "user", content };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setDraft("");
    setGoal(goalFromChatMessages(nextThread));
    const reply = await requestPlan(goalFromChatMessages(nextThread));
    if (!reply.ok) {
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content: reply.error },
      ]);
      return;
    }
    setAideStep("plan");
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "assistant", content: reply.content, cards: reply.cards },
    ]);
  }

  async function proposeFromAide() {
    const text = goal.trim();
    if (!text) {
      setError("Describe the domain, tone, or evals you care about.");
      return;
    }
    setMessages((prev) => {
      const lastUser = [...prev].reverse().find((m) => m.role === "user");
      if (lastUser?.content === text) return prev;
      return [...prev, { id: newId(), role: "user", content: text }];
    });
    const reply = await requestPlan(text);
    if (!reply.ok) return;
    setAideStep("plan");
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "assistant", content: reply.content, cards: reply.cards },
    ]);
  }

  async function saveDataset(name: string, body: string, announce: string) {
    const parsed = parseDatasetRows(body);
    if (parsed.error) {
      setError(parsed.error);
      return null;
    }
    const dsLabel = name.trim() || plan?.jobName || "Training set";
    setSaving(true);
    setError(null);
    const res = await fetch("/api/training/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: dsLabel,
        purpose: plan?.method || "sft",
        rows: parsed.rows,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(
        data.error ||
          "Upload failed. If the file is over 2MB, put it on GCS and pass a gs:// URI from the library."
      );
      return null;
    }
    const created = data.dataset as
      | { id: string; name: string; purpose: string; rowCount: number; status: string }
      | undefined;
    if (!created?.id) {
      setError("Upload succeeded without a dataset id. Refresh and pick it from the library.");
      return null;
    }
    const nextDatasets: DatasetSummary[] = [
      ...datasets,
      {
        id: created.id,
        name: created.name,
        purpose: created.purpose,
        rowCount: created.rowCount,
        status: created.status,
      },
    ];
    setPendingDatasetId(created.id);
    setDsName("");
    setDsBody("");
    const nextPlan = plan
      ? applyPlanEdits(plan, { datasetId: created.id }, catalog, nextDatasets, capabilities)
      : null;
    if (nextPlan) setPlan(nextPlan);
    await onRefresh();
    setAideStep("train");
    const nextReady = nextPlan
      ? launchReadiness(nextPlan, nextDatasets, capabilities, catalog)
      : null;
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", content: announce },
      {
        id: newId(),
        role: "assistant",
        content: nextPlan
          ? `Attached “${created.name}” (${created.rowCount} rows). ${
              nextReady?.ok
                ? "Ready to start training."
                : "Review the plan, then start when the blockers are clear."
            }`
          : `Saved “${created.name}” (${created.rowCount} rows). Tell me what the model should be good at and I will propose a plan.`,
        cards: nextPlan && nextReady ? plannerChatCards(nextPlan, nextReady) : undefined,
      },
    ]);
    return created;
  }

  async function uploadDataset(ev: React.FormEvent) {
    ev.preventDefault();
    await saveDataset(dsName, dsBody, `Uploaded dataset “${dsName.trim() || plan?.jobName || "Training set"}”.`);
  }

  async function attachFile(file: File) {
    const text = await file.text();
    await saveDataset(file.name.replace(/\.(jsonl?|txt)$/i, "") || file.name, text, `Attached ${file.name}.`);
  }

  async function launch() {
    if (!plan || !ready?.ok) {
      setError(ready?.nextAction.label || "Fix the blockers below before launching.");
      setAideStep("data");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/training/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: plan.jobName,
        method: plan.method,
        baseModelId: plan.baseModelId,
        datasetId: plan.datasetId,
        lora: plan.hyperparameters.lora,
        epochs: plan.hyperparameters.epochs,
        learningRate: plan.hyperparameters.learning_rate,
        batchSize: plan.hyperparameters.batch_size,
        lora_rank: plan.hyperparameters.lora_rank,
        hyperparameters: planToHyperparameters(plan),
        plan,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !data.job?.id) {
      setError(data.error || "The job API rejected the launch. Nothing was faked — fix the error and try again.");
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: data.error || "The job API rejected the launch. Nothing was faked — fix the error and try again.",
        },
      ]);
      return;
    }
    setWatchingId(data.job.id);
    setExplanation(null);
    setAideStep("train");
    setMessages((prev) => [
      ...prev,
      {
        id: newId(),
        role: "assistant",
        content: `Started “${plan.jobName}”. Watching the real job — this is not a simulated id.`,
        cards: ["plan"],
        jobId: data.job.id,
      },
    ]);
    await onRefresh();
  }

  async function jobAction(action: "retry" | "cancel") {
    if (!watching) return;
    setSaving(true);
    const res = await fetch(`/api/training/jobs/${watching.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    setCancelOpen(false);
    if (!res.ok) {
      setError(data.error || `Could not ${action} that job.`);
      return;
    }
    setExplanation(null);
    await onRefresh();
  }

  async function explain(job: LibraryJob) {
    setExplaining(true);
    const res = await fetch("/api/training/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, statusMessage: job.statusMessage }),
    });
    const data = await res.json().catch(() => ({}));
    setExplaining(false);
    if (!res.ok) {
      setError(data.error || "Could not explain that failure. Read the status line and retry.");
      return;
    }
    setExplanation(data.explanation);
  }

  const hasUserTurn = messages.some((m) => m.role === "user");
  const latestCardsAt = [...messages].reverse().findIndex((m) => m.role === "assistant" && m.cards?.length);
  const latestCardMessageId =
    latestCardsAt >= 0 ? messages[messages.length - 1 - latestCardsAt]?.id : null;

  const aide = (
    <TrainingAide
      mode={layout === "aide" ? "wizard" : "panel"}
      catalog={catalog}
      datasets={datasets}
      plan={plan}
      goal={goal}
      setGoal={setGoal}
      planSource={planSource}
      planNote={planNote}
      ready={ready}
      saving={saving}
      watching={watching}
      explanation={explanation}
      explaining={explaining}
      setCancelOpen={setCancelOpen}
      step={aideStep}
      setStep={setAideStep}
      onPropose={() => void proposeFromAide()}
      onEdit={editPlan}
      onUpload={(ev) => void uploadDataset(ev)}
      dsName={dsName}
      setDsName={setDsName}
      dsBody={dsBody}
      setDsBody={setDsBody}
      onLaunch={() => void launch()}
      onRetry={() => void jobAction("retry")}
      onExplain={(job) => void explain(job)}
      onPickChip={(chip) => {
        setGoal(chip);
        setDraft(chip);
      }}
    />
  );

  if (layout === "aide") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {trainerLabel(capabilities)}{" "}
          <Link href="/dashboard/models" className="text-foreground underline-offset-2 hover:underline">
            Already have weights? Import them.
          </Link>
        </div>
        {error ? (
          <div className="alert-error mb-4 text-sm" role="alert">
            {error}
          </div>
        ) : null}
        {aide}
        <ConfirmCancelJobDialog
          open={cancelOpen}
          name={watching?.name || "this job"}
          busy={saving}
          onOpenChange={setCancelOpen}
          onConfirm={() => void jobAction("cancel")}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-0">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {trainerLabel(capabilities)}{" "}
            <Link href="/dashboard/models" className="text-foreground underline-offset-2 hover:underline">
              Import weights
            </Link>
          </p>
          <button
            type="button"
            className="btn-ghost btn-sm hidden xl:inline-flex"
            onClick={() => setAideColumn((v) => !v)}
            aria-pressed={aideColumn}
          >
            {aideColumn ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
            Aide
          </button>
        </div>

        {error ? (
          <div className="alert-error mb-3 text-sm" role="alert">
            {error}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 md:p-5">
            {messages.map((m) => {
              const liveCards =
                m.id === latestCardMessageId && plan && ready && !m.jobId
                  ? plannerChatCards(plan, ready)
                  : m.id === latestCardMessageId
                    ? m.cards
                    : undefined;
              return (
                <article
                  key={m.id}
                  className={cn(
                    "max-w-[42rem] rounded-xl border px-3 py-2 text-sm",
                    m.role === "user"
                      ? "ml-auto border-border bg-accent text-foreground"
                      : "border-border bg-background text-foreground"
                  )}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {m.role === "user" ? "You" : "Planner"}
                  </p>
                  <p className="whitespace-pre-wrap leading-6">{m.content}</p>
                  {liveCards?.includes("plan") && plan ? (
                    <PlanCard plan={plan} datasets={datasets} />
                  ) : null}
                  {liveCards?.includes("dataset") && plan ? (
                    <DatasetCard
                      plan={plan}
                      datasets={datasets}
                      dsName={dsName}
                      setDsName={setDsName}
                      dsBody={dsBody}
                      setDsBody={setDsBody}
                      saving={saving}
                      onUpload={(ev) => void uploadDataset(ev)}
                      onPick={(id) => {
                        editPlan({ datasetId: id });
                        setPendingDatasetId(id);
                      }}
                      onAttach={() => fileRef.current?.click()}
                    />
                  ) : null}
                  {liveCards?.includes("launch") && plan ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={saving || !ready?.ok}
                        onClick={() => void launch()}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                        Start training
                      </button>
                    </div>
                  ) : null}
                  {m.jobId ? (
                    <div className="mt-3">
                      {jobs.find((j) => j.id === m.jobId) ? (
                        <JobStatus
                          job={jobs.find((j) => j.id === m.jobId)!}
                          saving={saving}
                          explanation={watchingId === m.jobId ? explanation : null}
                          explaining={watchingId === m.jobId && explaining}
                          onRetry={() => void jobAction("retry")}
                          onExplain={() => {
                            const job = jobs.find((j) => j.id === m.jobId);
                            if (job) void explain(job);
                          }}
                          onCancel={() => setCancelOpen(true)}
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">Job {m.jobId} — refresh if status is missing.</p>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {saving ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Planner is working…
              </p>
            ) : null}
          </div>

          <div className="border-t border-border p-3">
            {!hasUserTurn ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {GOAL_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setDraft(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
            <form
              className="od-composer"
              onSubmit={(ev) => {
                ev.preventDefault();
                void sendChat(draft);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".json,.jsonl,.txt,application/json,text/plain"
                className="hidden"
                onChange={(ev) => {
                  const file = ev.target.files?.[0];
                  ev.target.value = "";
                  if (file) void attachFile(file);
                }}
              />
              <button
                type="button"
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                title="Attach JSON or JSONL"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
                <span className="sr-only">Attach dataset file</span>
              </button>
              <textarea
                value={draft}
                rows={1}
                placeholder="What should this model be good at?"
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChat(draft);
                  }
                }}
                className="max-h-40 min-h-[22px] min-w-0 flex-1 resize-none bg-transparent py-2 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              />
              <button type="submit" className="od-send" disabled={saving || !draft.trim()} aria-label="Send">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </div>
      </section>

      <aside
        className={cn(
          "hidden min-h-0 w-[min(380px,32vw)] shrink-0 flex-col overflow-y-auto border-l border-border pl-5",
          aideColumn && "xl:flex"
        )}
      >
        {aide}
      </aside>
      <ConfirmCancelJobDialog
        open={cancelOpen}
        name={watching?.name || "this job"}
        busy={saving}
        onOpenChange={setCancelOpen}
        onConfirm={() => void jobAction("cancel")}
      />
    </div>
  );
}

function PlanCard({ plan, datasets }: { plan: TrainingPlan; datasets: DatasetSummary[] }) {
  const ds = plan.datasetId ? datasets.find((d) => d.id === plan.datasetId) : null;
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-sm font-medium text-foreground">{plan.jobName}</p>
      <p className="text-xs text-muted-foreground">
        {plan.baseModelLabel || plan.baseModelId || "No base"} · {plan.method.toUpperCase()} / {plan.adapter}
        {ds ? ` · ${ds.name}` : ""}
      </p>
      {plan.blockers.length ? <Blockers blockers={plan.blockers} /> : null}
    </div>
  );
}

function DatasetCard({
  plan,
  datasets,
  dsName,
  setDsName,
  dsBody,
  setDsBody,
  saving,
  onUpload,
  onPick,
  onAttach,
}: {
  plan: TrainingPlan;
  datasets: DatasetSummary[];
  dsName: string;
  setDsName: (v: string) => void;
  dsBody: string;
  setDsBody: (v: string) => void;
  saving: boolean;
  onUpload: (ev: FormEvent) => void;
  onPick: (id: string) => void;
  onAttach: () => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-3">
      <p className="text-sm font-medium text-foreground">Need a dataset?</p>
      <p className="text-xs text-muted-foreground">
        Columns: {plan.datasetShape.suggestedColumns.join(", ")}. Aim for {plan.datasetShape.minRows}+ rows. Attach a
        file from the composer or paste JSON/JSONL here.
      </p>
      <form onSubmit={onUpload} className="space-y-2">
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          placeholder="Dataset name"
          value={dsName}
          onChange={(e) => setDsName(e.target.value)}
        />
        <textarea
          className="h-28 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
          placeholder={JSON.stringify(plan.datasetShape.exampleRow, null, 2)}
          value={dsBody}
          onChange={(e) => setDsBody(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save dataset
          </button>
          <button type="button" className="btn-secondary" onClick={onAttach}>
            <Paperclip className="h-4 w-4" /> Attach file
          </button>
        </div>
      </form>
      {datasets.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Or pick an existing set</p>
          {datasets.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d.id)}
              className={cn(
                "w-full rounded-lg border p-2 text-left text-sm",
                plan.datasetId === d.id ? "border-primary bg-primary/10" : "border-border bg-background"
              )}
            >
              <p className="font-medium text-foreground">{d.name}</p>
              <p className="text-xs text-muted-foreground">
                {d.purpose} · {d.rowCount} rows
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
