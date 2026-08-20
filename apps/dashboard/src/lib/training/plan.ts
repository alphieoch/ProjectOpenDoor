/**
 * Pure training planner — catalog pick, dataset checks, launch blockers.
 * No I/O. The dashboard route calls the house/gateway chat, then this module.
 */

export const TRAINING_METHODS = ["sft", "dpo", "orpo", "rft", "grpo"] as const;
export type TrainingMethod = (typeof TRAINING_METHODS)[number];

export const TRAINING_ADAPTERS = ["lora", "full", "continued_pretrain"] as const;
export type TrainingAdapter = (typeof TRAINING_ADAPTERS)[number];

export const MIN_DATASET_ROWS_WARN = 20;
export const MIN_DATASET_ROWS_RECOMMENDED = 50;
export const DEFAULT_EPOCHS = 3;
export const DEFAULT_LEARNING_RATE = 0.0001;
export const DEFAULT_BATCH_SIZE = 4;
export const DEFAULT_LORA_RANK = 8;

export type CatalogModel = {
  id: string;
  label?: string;
  family?: string;
  provider?: string;
  ready?: boolean;
  modality?: string;
};

export type DatasetSummary = {
  id: string;
  name: string;
  purpose: string;
  rowCount: number;
  status?: string;
  storageUri?: string | null;
  sample?: unknown;
};

export type TrainerCapabilities = {
  vertex: boolean;
  together: boolean;
  localTrainer: boolean;
  customJobImage: boolean;
  simulated: boolean;
  hasRealTrainer: boolean;
};

export type TrainingBlocker = {
  code: string;
  severity: "block" | "warn";
  message: string;
  nextAction: string;
};

export type TrainingNextAction = {
  id:
    | "describe_goal"
    | "upload_dataset"
    | "pick_dataset"
    | "review_plan"
    | "launch"
    | "configure_trainer"
    | "retry"
    | "import_weights"
    | "use_gemini_sft"
    | "check_catalog";
  label: string;
  reason: string;
};

export type TrainingHyperparameters = {
  lora: boolean;
  lora_rank: number;
  epochs: number;
  learning_rate: number;
  batch_size: number;
};

export type TrainingPlan = {
  jobName: string;
  goal: string;
  summary: string;
  baseModelId: string;
  baseModelLabel: string;
  method: TrainingMethod;
  adapter: "lora" | "full";
  datasetId: string | null;
  datasetShape: {
    purpose: TrainingMethod | "eval";
    suggestedColumns: string[];
    exampleRow: unknown;
    minRows: number;
    warning: string | null;
  };
  hyperparameters: TrainingHyperparameters;
  evalCriteria: string[];
  blockers: TrainingBlocker[];
  nextAction: TrainingNextAction;
  honesty: string;
  trainerPath: "vertex" | "together" | "simulated" | "none";
};

export type LlmPlanDraft = {
  jobName?: unknown;
  summary?: unknown;
  baseModelId?: unknown;
  method?: unknown;
  adapter?: unknown;
  datasetId?: unknown;
  evalCriteria?: unknown;
  epochs?: unknown;
  learning_rate?: unknown;
  batch_size?: unknown;
  lora_rank?: unknown;
  datasetNotes?: unknown;
};

export type BuildPlanInput = {
  goal: string;
  catalog: CatalogModel[];
  datasets: DatasetSummary[];
  capabilities: TrainerCapabilities;
  draft?: LlmPlanDraft | null;
  selectedDatasetId?: string | null;
};

const CLOSED_UNTRAINABLE =
  /^(gpt-|o1|o3|o4|chatgpt|claude|anthropic|command-r|sonar)/i;

export function isTrainingMethod(value: string): value is TrainingMethod {
  return (TRAINING_METHODS as readonly string[]).includes(value);
}

export function emptyCapabilities(): TrainerCapabilities {
  return {
    vertex: false,
    together: false,
    localTrainer: false,
    customJobImage: false,
    simulated: false,
    hasRealTrainer: false,
  };
}

export function inferTrainingModality(id: string, label = ""): string {
  const s = `${id} ${label}`.toLowerCase();
  if (/(^|[\s/_-])rerank(er)?([\s/_-]|$)/.test(s)) return "rerank";
  if (
    /text-embedding|embed|nomic-embed|e5-|gte-|minilm|voyage-|bge-/.test(s) ||
    /(^|[\s/_-])bge([\s/_-]|$)/.test(s)
  ) {
    return "embedding";
  }
  if (/imagen|dall-e|gpt-image|flux-|stable-diffusion|gemini-[\w.-]*-image/.test(s)) {
    return "image";
  }
  if (/(^|[\s/_-])veo([\s/_-]|$)|text-to-video/.test(s)) return "video";
  return "chat";
}

export function isTrainableCatalogModel(model: CatalogModel): boolean {
  const id = String(model.id || "").trim();
  if (!id) return false;
  if (id.startsWith("ft:")) return false;
  if (id.startsWith("custom:")) return false;
  const modality = (model.modality || inferTrainingModality(id, model.label)).toLowerCase();
  if (modality !== "chat") return false;
  if (CLOSED_UNTRAINABLE.test(id)) return false;
  return true;
}

export function trainableCatalog(catalog: CatalogModel[]): CatalogModel[] {
  return catalog.filter(isTrainableCatalogModel);
}

export function isGeminiOrGemma(modelId: string): boolean {
  const id = modelId.replace(/^google\//, "").toLowerCase();
  return id.startsWith("gemini") || id.startsWith("gemma") || id.includes("gemma-");
}

export function jobNameFromGoal(goal: string): string {
  const cleaned = goal.replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 6);
  const name = words.join(" ") || "Fine-tune";
  return name.slice(0, 80);
}

export function suggestedColumns(method: TrainingMethod | "eval"): string[] {
  if (method === "dpo" || method === "orpo") return ["prompt", "chosen", "rejected"];
  if (method === "rft" || method === "grpo") return ["prompt", "completion", "reward"];
  return ["messages"];
}

export function exampleRowForMethod(method: TrainingMethod | "eval"): unknown {
  if (method === "dpo" || method === "orpo") {
    return {
      prompt: "How do I reset my password?",
      chosen: "Open Settings → Security → Reset password, then check your email.",
      rejected: "Just guess until it works.",
    };
  }
  if (method === "rft" || method === "grpo") {
    return { prompt: "Summarize this ticket.", completion: "Billing issue, priority low.", reward: 1 };
  }
  return {
    messages: [
      { role: "user", content: "How do I reset my password?" },
      { role: "assistant", content: "Open Settings → Security → Reset password." },
    ],
  };
}

export function parseDatasetRows(text: string): { rows: unknown[]; error: string | null } {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { rows: [], error: "Paste a JSON array or JSONL (one object per line)." };
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return { rows: [], error: "JSON must be an array of records." };
      if (!parsed.length) return { rows: [], error: "The array is empty — add at least one example." };
      return { rows: parsed, error: null };
    } catch {
      return { rows: [], error: "Could not parse that JSON array. Check commas and quotes." };
    }
  }
  const rows: unknown[] = [];
  for (const [i, line] of trimmed.split(/\n/).entries()) {
    const item = line.trim();
    if (!item) continue;
    try {
      rows.push(JSON.parse(item));
    } catch {
      return { rows: [], error: `Line ${i + 1} is not valid JSON. Use JSONL or wrap the file in [ ].` };
    }
  }
  if (!rows.length) return { rows: [], error: "No JSON objects found in that file." };
  return { rows, error: null };
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function nearestLoraRank(n: number): number {
  const allowed = [1, 2, 4, 8, 16, 32];
  return allowed.reduce((best, cur) => (Math.abs(cur - n) < Math.abs(best - n) ? cur : best), 8);
}

export function mentionInGoal(goal: string, catalog: CatalogModel[]): CatalogModel | null {
  const hay = goal.toLowerCase();
  if (!hay) return null;
  const sorted = [...catalog].sort((a, b) => b.id.length - a.id.length);
  for (const model of sorted) {
    const id = model.id.toLowerCase();
    const label = (model.label || "").toLowerCase();
    if (id && hay.includes(id)) return model;
    if (label && label.length >= 4 && hay.includes(label)) return model;
  }
  return null;
}

function scoreBaseModel(model: CatalogModel, capabilities: TrainerCapabilities): number {
  let score = 0;
  if (model.ready) score += 8;
  if (capabilities.vertex && isGeminiOrGemma(model.id)) score += 20;
  // Gemini SFT is the documented Vertex path; Gemma is also valid but less common.
  if (capabilities.vertex && model.id.replace(/^google\//, "").toLowerCase().startsWith("gemini")) {
    score += 4;
  }
  if (capabilities.together && /together|llama|mistral|qwen|gemma/i.test(`${model.id} ${model.provider}`)) {
    score += 10;
  }
  if ((model.family || "").toLowerCase() === "open_weight") score += 2;
  const provider = (model.provider || "").toLowerCase();
  if (provider.includes("vertex") || provider.includes("google")) score += 3;
  if (provider.includes("together")) score += 2;
  return score;
}

export function pickBaseModel(
  goal: string,
  catalog: CatalogModel[],
  capabilities: TrainerCapabilities,
  preferredId?: string | null
): CatalogModel | null {
  const trainable = trainableCatalog(catalog);
  if (!trainable.length) return null;
  const preferred = preferredId
    ? trainable.find((m) => m.id === preferredId)
    : null;
  if (preferred) return preferred;
  const mentioned = mentionInGoal(goal, trainable);
  if (mentioned) return mentioned;
  return [...trainable].sort((a, b) => scoreBaseModel(b, capabilities) - scoreBaseModel(a, capabilities))[0] || null;
}

export function resolveTrainerPath(
  capabilities: TrainerCapabilities,
  method: TrainingMethod,
  baseModelId: string
): TrainingPlan["trainerPath"] {
  if (capabilities.together) return "together";
  if (capabilities.vertex) {
    if (method === "sft" && isGeminiOrGemma(baseModelId)) return "vertex";
    if (capabilities.customJobImage) return "vertex";
    return "vertex";
  }
  if (capabilities.localTrainer) return "vertex";
  if (capabilities.simulated) return "simulated";
  return "none";
}

export function trainerHonesty(
  capabilities: TrainerCapabilities,
  method: TrainingMethod,
  baseModelId: string
): string {
  const path = resolveTrainerPath(capabilities, method, baseModelId);
  if (path === "together") {
    return "Together is configured, so the runner submits a real Together fine-tune first (LoRA unless you turn it off).";
  }
  if (path === "vertex") {
    if (method === "sft" && isGeminiOrGemma(baseModelId)) {
      return "Vertex supervised tuning will run this Gemini/Gemma SFT job. Needs a JSONL dataset (inline rows or gs://).";
    }
    if (!capabilities.customJobImage) {
      return "Vertex is the trainer, but this method/base is not Gemini/Gemma SFT. Without VERTEX_CUSTOM_TRAINING_IMAGE the job will fail — switch to Gemini/Gemma SFT or add a CustomJob image.";
    }
    return "Vertex will submit a CustomJob with VERTEX_CUSTOM_TRAINING_IMAGE. This stack does not mint a simulated ft: model.";
  }
  if (path === "simulated") {
    return "No cloud trainer is configured. ALLOW_SIMULATED_TRAINING=1 is on, so this is a local/dev dry-run — not a GPU cluster.";
  }
  return "No trainer is configured. You can still plan and upload data. To actually train, set GOOGLE_CLOUD_PROJECT + Application Default Credentials (Vertex) or TOGETHER_API_KEY. Production never mints simulated ft: models.";
}

function datasetWarning(dataset: DatasetSummary | null, method: TrainingMethod): string | null {
  if (!dataset) return "No dataset selected yet. Upload JSONL rows that match the suggested columns.";
  if (dataset.rowCount <= 0 && !dataset.storageUri) {
    return "This dataset has no rows. Paste a JSON array or point storageUri at a gs:// JSONL file.";
  }
  if (dataset.rowCount > 0 && dataset.rowCount < MIN_DATASET_ROWS_WARN) {
    return `Only ${dataset.rowCount} rows — fine-tunes usually need ${MIN_DATASET_ROWS_WARN}+ examples (${MIN_DATASET_ROWS_RECOMMENDED}+ is safer) or the model will memorize.`;
  }
  if (dataset.rowCount > 0 && dataset.rowCount < MIN_DATASET_ROWS_RECOMMENDED) {
    return `${dataset.rowCount} rows will run, but ${MIN_DATASET_ROWS_RECOMMENDED}+ is a better floor for ${method.toUpperCase()}.`;
  }
  if (dataset.purpose && dataset.purpose !== method && dataset.purpose !== "eval") {
    return `Dataset purpose is ${dataset.purpose}, but the plan is ${method}. Re-upload or pick a matching set.`;
  }
  return null;
}

export function collectBlockers(input: {
  plan: Pick<TrainingPlan, "baseModelId" | "method" | "adapter" | "datasetId" | "trainerPath">;
  catalog: CatalogModel[];
  datasets: DatasetSummary[];
  capabilities: TrainerCapabilities;
  forLaunch?: boolean;
}): TrainingBlocker[] {
  const { plan, catalog, datasets, capabilities, forLaunch } = input;
  const blockers: TrainingBlocker[] = [];
  const trainable = trainableCatalog(catalog);

  if (!plan.baseModelId) {
    blockers.push({
      code: "missing_base_model",
      severity: "block",
      message: "No trainable base model is selected.",
      nextAction: trainable.length
        ? "Pick a Gemini/Gemma (Vertex) or Together-compatible chat model from the catalog."
        : "Seed or enable a chat model in the catalog. Closed GPT/Claude ids cannot be fine-tuned here.",
    });
  } else if (trainable.length && !trainable.some((m) => m.id === plan.baseModelId)) {
    blockers.push({
      code: "base_not_in_catalog",
      severity: "block",
      message: `${plan.baseModelId} is not in your trainable catalog.`,
      nextAction: "Choose a model the catalog actually lists, or add weights from Models → Import.",
    });
  }

  const dataset = plan.datasetId ? datasets.find((d) => d.id === plan.datasetId) || null : null;
  if (!dataset) {
    blockers.push({
      code: "missing_dataset",
      severity: forLaunch ? "block" : "warn",
      message: "No dataset is attached.",
      nextAction: "Upload a JSONL array of examples, or pick an existing dataset.",
    });
  } else if (dataset.rowCount <= 0 && !dataset.storageUri) {
    blockers.push({
      code: "empty_dataset",
      severity: "block",
      message: `${dataset.name} has no rows.`,
      nextAction: "Add JSONL rows or a gs:// storageUri, then come back.",
    });
  } else if (dataset.rowCount > 0 && dataset.rowCount < MIN_DATASET_ROWS_WARN) {
    blockers.push({
      code: "dataset_too_small",
      severity: "warn",
      message: `${dataset.name} has only ${dataset.rowCount} rows.`,
      nextAction: `Add more examples (aim for ${MIN_DATASET_ROWS_RECOMMENDED}+) or accept a high overfitting risk.`,
    });
  }

  if (plan.trainerPath === "none") {
    blockers.push({
      code: "no_trainer",
      severity: forLaunch ? "block" : "warn",
      message: "No trainer is configured on this workspace.",
      nextAction:
        "Set GOOGLE_CLOUD_PROJECT with ADC for Vertex, or TOGETHER_API_KEY. If you already have weights, import them from Models instead.",
    });
  }

  if (
    capabilities.vertex &&
    !capabilities.together &&
    !(plan.method === "sft" && isGeminiOrGemma(plan.baseModelId)) &&
    !capabilities.customJobImage
  ) {
    blockers.push({
      code: "needs_custom_job",
      severity: "block",
      message: "This method/base is not Vertex supervised tuning (Gemini/Gemma SFT).",
      nextAction: "Switch the plan to Gemini/Gemma SFT + LoRA, or set VERTEX_CUSTOM_TRAINING_IMAGE.",
    });
  }

  if (capabilities.together && plan.method !== "sft") {
    blockers.push({
      code: "together_sft_only",
      severity: "warn",
      message: "Together is configured and the runner always submits a LoRA SFT job first.",
      nextAction: "Stay on SFT, or unset TOGETHER_API_KEY if you really need Vertex DPO/CustomJob.",
    });
  }

  if (plan.adapter === "full" && capabilities.together) {
    blockers.push({
      code: "full_ft_cost",
      severity: "warn",
      message: "Full fine-tune is more expensive and rarely needed.",
      nextAction: "Keep LoRA unless you have a reason to train every weight.",
    });
  }

  return blockers;
}

export function nextActionFromBlockers(
  blockers: TrainingBlocker[],
  stage: "goal" | "plan" | "data" | "launch"
): TrainingNextAction {
  const block = blockers.find((b) => b.severity === "block");
  const warn = blockers.find((b) => b.severity === "warn");
  const hit = block || (stage === "launch" ? warn : undefined);
  if (hit) {
    const id: TrainingNextAction["id"] =
      hit.code === "missing_dataset" || hit.code === "empty_dataset" || hit.code === "dataset_too_small"
        ? "upload_dataset"
        : hit.code === "no_trainer"
          ? "configure_trainer"
          : hit.code === "needs_custom_job"
            ? "use_gemini_sft"
            : hit.code === "missing_base_model" || hit.code === "base_not_in_catalog"
              ? "check_catalog"
              : "review_plan";
    return { id, label: hit.nextAction, reason: hit.message };
  }
  if (stage === "goal") {
    return { id: "describe_goal", label: "Describe what the model should be good at.", reason: "The planner needs a goal." };
  }
  if (stage === "plan") {
    return { id: "review_plan", label: "Review the plan, then attach data.", reason: "Nothing is blocking the plan." };
  }
  if (stage === "data") {
    return { id: "pick_dataset", label: "Attach a dataset that matches the suggested columns.", reason: "The plan is ready." };
  }
  return { id: "launch", label: "Start the fine-tune with this plan.", reason: "Base model and dataset are ready." };
}

export function launchReadiness(
  plan: TrainingPlan,
  datasets: DatasetSummary[],
  capabilities: TrainerCapabilities,
  catalog: CatalogModel[] = []
) {
  const launchBlockers = collectBlockers({
    plan,
    catalog: catalog.length ? catalog : plan.baseModelId ? [{ id: plan.baseModelId }] : [],
    datasets,
    capabilities,
    forLaunch: true,
  });
  const hard = launchBlockers.filter((b) => b.severity === "block");
  return {
    ok: hard.length === 0,
    blockers: launchBlockers,
    nextAction: nextActionFromBlockers(launchBlockers, "launch"),
  };
}

export function parseLlmPlanDraft(text: string): LlmPlanDraft | null {
  const obj = extractJsonObject(text);
  return obj;
}

export function buildTrainingPlan(input: BuildPlanInput): TrainingPlan {
  const goal = input.goal.trim();
  const draft = input.draft || {};
  const trainable = trainableCatalog(input.catalog);
  const preferred = asString(draft.baseModelId) || null;
  const picked = pickBaseModel(goal, trainable, input.capabilities, preferred);
  const methodRaw = asString(draft.method).toLowerCase();
  const adapterRaw = asString(draft.adapter).toLowerCase();
  let method: TrainingMethod = isTrainingMethod(methodRaw) ? methodRaw : "sft";
  let adapter: "lora" | "full" = "lora";
  const extraBlockers: TrainingBlocker[] = [];

  if (adapterRaw === "full") adapter = "full";
  if (adapterRaw === "continued_pretrain") {
    method = "sft";
    adapter = "lora";
    extraBlockers.push({
      code: "continued_pretrain_unsupported",
      severity: "warn",
      message: "Continued pretrain is not a first-class trainer path here.",
      nextAction: "Using SFT + LoRA on your examples instead. That is what Vertex/Together actually run.",
    });
  }

  const datasetId =
    asString(draft.datasetId) ||
    input.selectedDatasetId ||
    input.datasets.find((d) => d.purpose === method || d.purpose === "sft")?.id ||
    input.datasets[0]?.id ||
    null;
  const dataset = datasetId ? input.datasets.find((d) => d.id === datasetId) || null : null;

  const hyperparameters: TrainingHyperparameters = {
    lora: adapter === "lora",
    lora_rank: nearestLoraRank(clamp(asNumber(draft.lora_rank, DEFAULT_LORA_RANK), 1, 32)),
    epochs: Math.round(clamp(asNumber(draft.epochs, DEFAULT_EPOCHS), 1, 10)),
    learning_rate: clamp(asNumber(draft.learning_rate, DEFAULT_LEARNING_RATE), 1e-6, 1e-2),
    batch_size: Math.round(clamp(asNumber(draft.batch_size, DEFAULT_BATCH_SIZE), 1, 32)),
  };

  const evalCriteria = Array.isArray(draft.evalCriteria)
    ? draft.evalCriteria.map((c) => String(c).trim()).filter(Boolean).slice(0, 8)
    : [];
  if (!evalCriteria.length && goal) {
    evalCriteria.push(`Answers match the domain and tone described: ${goal.slice(0, 160)}`);
  }

  const trainerPath = resolveTrainerPath(input.capabilities, method, picked?.id || "");
  const planCore = {
    baseModelId: picked?.id || "",
    method,
    adapter,
    datasetId,
    trainerPath,
  };
  const blockers = [
    ...extraBlockers,
    ...collectBlockers({
      plan: planCore,
      catalog: input.catalog,
      datasets: input.datasets,
      capabilities: input.capabilities,
      forLaunch: false,
    }),
  ];

  const notes = asString(draft.datasetNotes);
  const warning = datasetWarning(dataset, method);
  const summary =
    asString(draft.summary) ||
    (goal
      ? `Fine-tune ${picked?.label || picked?.id || "a catalog model"} with ${method.toUpperCase()} (${adapter}) so it is better at: ${goal.slice(0, 180)}`
      : "Describe a goal so the planner can pick a base model and dataset shape.");

  return {
    jobName: asString(draft.jobName) || jobNameFromGoal(goal),
    goal,
    summary,
    baseModelId: picked?.id || "",
    baseModelLabel: picked?.label || picked?.id || "",
    method,
    adapter,
    datasetId,
    datasetShape: {
      purpose: method,
      suggestedColumns: suggestedColumns(method),
      exampleRow: exampleRowForMethod(method),
      minRows: MIN_DATASET_ROWS_WARN,
      warning: warning || notes || null,
    },
    hyperparameters,
    evalCriteria,
    blockers,
    nextAction: nextActionFromBlockers(blockers, goal ? (dataset ? "plan" : "data") : "goal"),
    honesty: trainerHonesty(input.capabilities, method, picked?.id || ""),
    trainerPath,
  };
}

export function planToHyperparameters(plan: TrainingPlan): Record<string, unknown> {
  return {
    lora: plan.hyperparameters.lora,
    lora_rank: plan.hyperparameters.lora_rank,
    epochs: plan.hyperparameters.epochs,
    learning_rate: plan.hyperparameters.learning_rate,
    batch_size: plan.hyperparameters.batch_size,
    plan: {
      goal: plan.goal,
      summary: plan.summary,
      method: plan.method,
      adapter: plan.adapter,
      baseModelId: plan.baseModelId,
      datasetId: plan.datasetId,
      evalCriteria: plan.evalCriteria,
      honesty: plan.honesty,
      trainerPath: plan.trainerPath,
    },
  };
}

export const PLANNER_OPENING =
  "What should this model be good at? Share the domain, tone, and how you will judge success. I will propose a catalog base and a method this stack can actually run.";

export type TrainingChatTurn = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type PlannerChatCard = "plan" | "dataset" | "launch";

/** Join user turns so follow-ups refine one planner goal. */
export function goalFromChatMessages(messages: TrainingChatTurn[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function formatPlannerReply(
  plan: TrainingPlan,
  extra?: { source?: "ai" | "heuristic" | null; note?: string | null }
): string {
  const base = plan.baseModelLabel || plan.baseModelId || "no trainable catalog model yet";
  const parts = [
    plan.summary,
    `Base: ${base}`,
    `Method: ${plan.method.toUpperCase()} · ${plan.adapter}`,
    `Next: ${plan.nextAction.label}`,
  ];
  if (plan.nextAction.id === "upload_dataset" || plan.nextAction.id === "pick_dataset") {
    parts.push(
      `Need a dataset? Upload JSON/JSONL here (columns: ${plan.datasetShape.suggestedColumns.join(", ")}).`
    );
  }
  if (extra?.note) {
    parts.push(extra.note);
  } else if (extra?.source === "heuristic") {
    parts.push("Catalog rules (planner fallback).");
  } else if (extra?.source === "ai") {
    parts.push("Proposed by the house chat model.");
  }
  return parts.filter(Boolean).join("\n");
}

export function plannerChatCards(
  plan: TrainingPlan,
  ready: { ok: boolean }
): PlannerChatCard[] {
  const cards: PlannerChatCard[] = ["plan"];
  const needsData =
    plan.nextAction.id === "upload_dataset" ||
    plan.nextAction.id === "pick_dataset" ||
    !plan.datasetId;
  if (needsData) cards.push("dataset");
  if (ready.ok) cards.push("launch");
  return cards;
}

export function applyPlanEdits(
  plan: TrainingPlan,
  edits: Partial<{
    jobName: string;
    baseModelId: string;
    method: string;
    adapter: string;
    datasetId: string | null;
    epochs: number;
    learning_rate: number;
    batch_size: number;
    lora_rank: number;
  }>,
  catalog: CatalogModel[],
  datasets: DatasetSummary[],
  capabilities: TrainerCapabilities
): TrainingPlan {
  return buildTrainingPlan({
    goal: plan.goal,
    catalog,
    datasets,
    capabilities,
    selectedDatasetId: edits.datasetId === undefined ? plan.datasetId : edits.datasetId,
    draft: {
      jobName: edits.jobName ?? plan.jobName,
      summary: plan.summary,
      baseModelId: edits.baseModelId ?? plan.baseModelId,
      method: edits.method ?? plan.method,
      adapter: edits.adapter ?? plan.adapter,
      datasetId: edits.datasetId === undefined ? plan.datasetId : edits.datasetId,
      evalCriteria: plan.evalCriteria,
      epochs: edits.epochs ?? plan.hyperparameters.epochs,
      learning_rate: edits.learning_rate ?? plan.hyperparameters.learning_rate,
      batch_size: edits.batch_size ?? plan.hyperparameters.batch_size,
      lora_rank: edits.lora_rank ?? plan.hyperparameters.lora_rank,
    },
  });
}

export type FailureExplanation = {
  headline: string;
  detail: string;
  nextAction: TrainingNextAction;
  code: string;
};

export function explainTrainingFailure(
  statusMessage: string | null | undefined,
  capabilities: TrainerCapabilities = emptyCapabilities()
): FailureExplanation {
  const msg = String(statusMessage || "").toLowerCase();

  if (!msg.trim()) {
    return {
      code: "unknown",
      headline: "The job stopped without a status.",
      detail: "Refresh the job. If it is still blank, retry — the runner writes a status once it starts.",
      nextAction: { id: "retry", label: "Retry the job and watch the status line.", reason: "No status message was stored." },
    };
  }

  if (msg.includes("no trainer configured") || msg.includes("allow_simulated_training")) {
    return {
      code: "no_trainer",
      headline: "Nothing is configured to actually train.",
      detail:
        "This workspace has no Vertex project/ADC and no Together key. Production will not invent an ft: model.",
      nextAction: {
        id: "configure_trainer",
        label: capabilities.simulated
          ? "This was a local dry-run. Add Vertex or Together to train for real."
          : "Set GOOGLE_CLOUD_PROJECT + ADC, or TOGETHER_API_KEY, then retry.",
        reason: "No trainer backend.",
      },
    };
  }

  if (msg.includes("dataset") && (msg.includes("not found") || msg.includes("require") || msg.includes("no rows") || msg.includes("inline"))) {
    return {
      code: "dataset",
      headline: "The trainer could not read a dataset.",
      detail: statusMessage || "Vertex/Together need JSONL rows or a gs:// URI.",
      nextAction: {
        id: "upload_dataset",
        label: "Upload JSONL rows (or a gs:// URI) that match the plan columns, then retry.",
        reason: "Missing or empty training file.",
      },
    };
  }

  if (msg.includes("together")) {
    return {
      code: "together",
      headline: "Together rejected or failed the fine-tune.",
      detail: statusMessage || "Together file upload or job create failed.",
      nextAction: {
        id: "retry",
        label: "Check TOGETHER_API_KEY and that the base model is Together-tuneable, then retry.",
        reason: "Together provider error.",
      },
    };
  }

  if (msg.includes("customjob") || msg.includes("custom training image") || msg.includes("vertex_custom_training_image")) {
    return {
      code: "custom_job",
      headline: "This job is not Gemini/Gemma SFT, and no CustomJob image is set.",
      detail: statusMessage || "DPO/ORPO/RFT/GRPO and non-Gemini bases need VERTEX_CUSTOM_TRAINING_IMAGE.",
      nextAction: {
        id: "use_gemini_sft",
        label: "Re-plan as Gemini/Gemma SFT + LoRA, or set VERTEX_CUSTOM_TRAINING_IMAGE.",
        reason: "Unsupported Vertex path.",
      },
    };
  }

  if (msg.includes("vertex") || msg.includes("adc") || msg.includes("google_cloud_project") || msg.includes("tuningjobs")) {
    return {
      code: "vertex",
      headline: "Vertex did not start or finish the tuning job.",
      detail: statusMessage || "Supervised tuning needs a GCP project, ADC, and a JSONL dataset.",
      nextAction: {
        id: "retry",
        label: "Confirm ADC, VERTEX_TUNING_BUCKET (or inline rows), and a Gemini/Gemma base, then retry.",
        reason: "Vertex trainer error.",
      },
    };
  }

  return {
    code: "failed",
    headline: "The training job failed.",
    detail: statusMessage || "The runner stored a failure without a mapped recovery.",
    nextAction: {
      id: "retry",
      label: "Fix the issue in the status line, then retry the same job.",
      reason: "Generic trainer failure.",
    },
  };
}
