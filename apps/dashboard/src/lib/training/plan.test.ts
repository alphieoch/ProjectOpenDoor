import { describe, expect, test } from "bun:test";
import {
  MIN_DATASET_ROWS_WARN,
  applyPlanEdits,
  buildTrainingPlan,
  collectBlockers,
  emptyCapabilities,
  exampleRowForMethod,
  explainTrainingFailure,
  extractJsonObject,
  formatPlannerReply,
  goalFromChatMessages,
  parseDatasetRows,
  isTrainableCatalogModel,
  jobNameFromGoal,
  launchReadiness,
  mentionInGoal,
  pickBaseModel,
  plannerChatCards,
  planToHyperparameters,
  suggestedColumns,
  trainerHonesty,
} from "./plan";

const gemini = { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", family: "closed", provider: "Vertex", ready: true, modality: "chat" };
const gemma = { id: "gemma-3-12b", label: "Gemma 3", family: "open_weight", provider: "Vertex", ready: true, modality: "chat" };
const gpt = { id: "gpt-4o", label: "GPT-4o", family: "closed", provider: "OpenAI", ready: true, modality: "chat" };
const embed = { id: "text-embedding-3-small", label: "Embeddings", modality: "embedding" };
const image = { id: "gemini-2.5-flash-image", label: "Flash Image", modality: "image" };

const catalog = [gemini, gemma, gpt, embed, image];

const dataset = {
  id: "ds-1",
  name: "Support SFT",
  purpose: "sft",
  rowCount: 80,
  status: "ready",
};

describe("trainable catalog", () => {
  test("keeps chat bases and drops embeddings, images, and closed GPT ids", () => {
    expect(isTrainableCatalogModel(gemini)).toBe(true);
    expect(isTrainableCatalogModel(gemma)).toBe(true);
    expect(isTrainableCatalogModel(gpt)).toBe(false);
    expect(isTrainableCatalogModel(embed)).toBe(false);
    expect(isTrainableCatalogModel(image)).toBe(false);
    expect(isTrainableCatalogModel({ id: "ft:abc", modality: "chat" })).toBe(false);
  });
});

describe("pickBaseModel", () => {
  test("prefers Gemini when Vertex is available", () => {
    const llama = { id: "llama-3.1-8b", label: "Llama", family: "open_weight", provider: "Together", ready: true, modality: "chat" };
    const picked = pickBaseModel("support replies", [...catalog, llama], { ...emptyCapabilities(), vertex: true, hasRealTrainer: true });
    expect(picked?.id).toBe("gemini-2.5-flash");
  });

  test("uses a model the user named if it is in the catalog", () => {
    const picked = pickBaseModel("tune gemma-3-12b for legal tone", catalog, emptyCapabilities());
    expect(picked?.id).toBe("gemma-3-12b");
  });

  test("returns null when the catalog has nothing trainable", () => {
    expect(pickBaseModel("anything", [gpt, embed], emptyCapabilities())).toBeNull();
  });

  test("mentionInGoal matches longer ids first", () => {
    expect(mentionInGoal("please use gemini-2.5-flash", catalog)?.id).toBe("gemini-2.5-flash");
  });
});

describe("buildTrainingPlan", () => {
  test("blocks a missing base model", () => {
    const plan = buildTrainingPlan({
      goal: "Be a polite support agent",
      catalog: [gpt],
      datasets: [],
      capabilities: emptyCapabilities(),
    });
    expect(plan.baseModelId).toBe("");
    expect(plan.blockers.some((b) => b.code === "missing_base_model" && b.severity === "block")).toBe(true);
  });

  test("warns when the dataset is too small", () => {
    const plan = buildTrainingPlan({
      goal: "Invoice tone",
      catalog,
      datasets: [{ ...dataset, rowCount: 4 }],
      capabilities: { ...emptyCapabilities(), vertex: true, hasRealTrainer: true },
      selectedDatasetId: "ds-1",
    });
    expect(plan.blockers.some((b) => b.code === "dataset_too_small")).toBe(true);
    expect(plan.datasetShape.warning).toContain(String(MIN_DATASET_ROWS_WARN));
  });

  test("maps continued pretrain to SFT LoRA and warns", () => {
    const plan = buildTrainingPlan({
      goal: "Keep learning from our docs",
      catalog,
      datasets: [dataset],
      capabilities: { ...emptyCapabilities(), vertex: true, hasRealTrainer: true },
      draft: { adapter: "continued_pretrain", method: "sft" },
    });
    expect(plan.method).toBe("sft");
    expect(plan.adapter).toBe("lora");
    expect(plan.blockers.some((b) => b.code === "continued_pretrain_unsupported")).toBe(true);
  });

  test("warns when no trainer is configured", () => {
    const plan = buildTrainingPlan({
      goal: "Support voice",
      catalog,
      datasets: [dataset],
      capabilities: emptyCapabilities(),
    });
    expect(plan.trainerPath).toBe("none");
    expect(plan.blockers.some((b) => b.code === "no_trainer")).toBe(true);
    expect(plan.honesty).toContain("GOOGLE_CLOUD_PROJECT");
  });

  test("blocks DPO on Vertex without a CustomJob image", () => {
    const plan = buildTrainingPlan({
      goal: "Prefer safer answers",
      catalog,
      datasets: [{ ...dataset, purpose: "dpo" }],
      capabilities: { ...emptyCapabilities(), vertex: true, hasRealTrainer: true },
      draft: { method: "dpo" },
    });
    expect(plan.blockers.some((b) => b.code === "needs_custom_job" && b.severity === "block")).toBe(true);
  });
});

describe("dataset shape", () => {
  test("SFT suggests messages; DPO suggests preference columns", () => {
    expect(suggestedColumns("sft")).toEqual(["messages"]);
    expect(suggestedColumns("dpo")).toEqual(["prompt", "chosen", "rejected"]);
    expect(exampleRowForMethod("sft")).toHaveProperty("messages");
    expect(exampleRowForMethod("dpo")).toHaveProperty("chosen");
  });
});

describe("launchReadiness", () => {
  test("blocks launch without a dataset", () => {
    const plan = buildTrainingPlan({
      goal: "Support voice",
      catalog,
      datasets: [],
      capabilities: { ...emptyCapabilities(), vertex: true, hasRealTrainer: true },
    });
    const ready = launchReadiness(plan, [], { ...emptyCapabilities(), vertex: true, hasRealTrainer: true }, catalog);
    expect(ready.ok).toBe(false);
    expect(ready.blockers.some((b) => b.code === "missing_dataset" && b.severity === "block")).toBe(true);
    expect(ready.nextAction.id).toBe("upload_dataset");
  });

  test("allows launch when catalog, dataset, and Vertex SFT line up", () => {
    const plan = buildTrainingPlan({
      goal: "Support voice",
      catalog,
      datasets: [dataset],
      capabilities: { ...emptyCapabilities(), vertex: true, hasRealTrainer: true },
    });
    const ready = launchReadiness(plan, [dataset], { ...emptyCapabilities(), vertex: true, hasRealTrainer: true }, catalog);
    expect(ready.ok).toBe(true);
    expect(ready.nextAction.id).toBe("launch");
  });

  test("blocks launch when there is no trainer", () => {
    const plan = buildTrainingPlan({
      goal: "Support voice",
      catalog,
      datasets: [dataset],
      capabilities: emptyCapabilities(),
    });
    const ready = launchReadiness(plan, [dataset], emptyCapabilities(), catalog);
    expect(ready.ok).toBe(false);
    expect(ready.nextAction.id).toBe("configure_trainer");
  });
});

describe("job helpers", () => {
  test("jobNameFromGoal keeps a short readable name", () => {
    expect(jobNameFromGoal("Make the bot sound like our support team on billing")).toBe(
      "Make the bot sound like our"
    );
  });

  test("planToHyperparameters nests the reviewable plan", () => {
    const plan = buildTrainingPlan({
      goal: "Support voice",
      catalog,
      datasets: [dataset],
      capabilities: { ...emptyCapabilities(), vertex: true, hasRealTrainer: true },
    });
    const hp = planToHyperparameters(plan);
    expect(hp.lora).toBe(true);
    expect((hp.plan as { goal: string }).goal).toBe("Support voice");
    expect(hp.epochs).toBe(3);
  });

  test("applyPlanEdits can switch the dataset and method", () => {
    const plan = buildTrainingPlan({
      goal: "Safer answers",
      catalog,
      datasets: [dataset, { id: "ds-2", name: "Prefs", purpose: "dpo", rowCount: 60 }],
      capabilities: { ...emptyCapabilities(), together: true, hasRealTrainer: true },
    });
    const next = applyPlanEdits(
      plan,
      { method: "dpo", datasetId: "ds-2" },
      catalog,
      [dataset, { id: "ds-2", name: "Prefs", purpose: "dpo", rowCount: 60 }],
      { ...emptyCapabilities(), together: true, hasRealTrainer: true }
    );
    expect(next.method).toBe("dpo");
    expect(next.datasetId).toBe("ds-2");
  });
});

describe("parseDatasetRows", () => {
  test("accepts a JSON array", () => {
    const out = parseDatasetRows('[{"messages":[{"role":"user","content":"Hi"}]}]');
    expect(out.error).toBeNull();
    expect(out.rows).toHaveLength(1);
  });

  test("accepts JSONL and rejects a broken line", () => {
    const ok = parseDatasetRows('{"a":1}\n{"b":2}');
    expect(ok.rows).toHaveLength(2);
    const bad = parseDatasetRows('{"a":1}\nnot-json');
    expect(bad.error).toContain("Line 2");
  });

  test("rejects an empty array", () => {
    expect(parseDatasetRows("[]").error).toContain("empty");
  });
});

describe("extractJsonObject", () => {
  test("reads a fenced object", () => {
    const obj = extractJsonObject('Sure.\n```json\n{"method":"sft","epochs":2}\n```');
    expect(obj?.method).toBe("sft");
    expect(obj?.epochs).toBe(2);
  });

  test("returns null on garbage", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("explainTrainingFailure", () => {
  test("maps missing trainer to configure_trainer", () => {
    const ex = explainTrainingFailure("No trainer configured. Set GOOGLE_CLOUD_PROJECT");
    expect(ex.code).toBe("no_trainer");
    expect(ex.nextAction.id).toBe("configure_trainer");
  });

  test("maps dataset errors to upload_dataset", () => {
    const ex = explainTrainingFailure("Vertex supervised tuning requires a gs:// JSONL dataset or inline rows");
    expect(ex.code).toBe("dataset");
    expect(ex.nextAction.id).toBe("upload_dataset");
  });

  test("maps CustomJob image errors to use_gemini_sft", () => {
    const ex = explainTrainingFailure("Set VERTEX_CUSTOM_TRAINING_IMAGE for a CustomJob");
    expect(ex.code).toBe("custom_job");
    expect(ex.nextAction.id).toBe("use_gemini_sft");
  });
});

describe("chat → plan mapping", () => {
  test("goalFromChatMessages joins user turns and skips blanks", () => {
    expect(
      goalFromChatMessages([
        { role: "assistant", content: "What should this model be good at?" },
        { role: "user", content: "  " },
        { role: "user", content: "Support tone" },
        { role: "assistant", content: "Plan…" },
        { role: "user", content: "Use Gemma instead" },
      ])
    ).toBe("Support tone\n\nUse Gemma instead");
  });

  test("formatPlannerReply includes base, method, and next step", () => {
    const plan = buildTrainingPlan({
      goal: "Support voice",
      catalog,
      datasets: [],
      capabilities: { ...emptyCapabilities(), vertex: true, hasRealTrainer: true },
    });
    const text = formatPlannerReply(plan, { source: "heuristic", note: "Catalog rules." });
    expect(text).toContain("Base:");
    expect(text).toMatch(/Method: SFT/i);
    expect(text).toContain("Next:");
    expect(text).toContain("Catalog rules.");
    expect(text).toContain("Need a dataset?");
  });

  test("plannerChatCards asks for a dataset before launch, then offers start", () => {
    const vertex = { ...emptyCapabilities(), vertex: true, hasRealTrainer: true };
    const waiting = buildTrainingPlan({
      goal: "Support voice",
      catalog,
      datasets: [],
      capabilities: vertex,
    });
    expect(plannerChatCards(waiting, { ok: false })).toEqual(["plan", "dataset"]);

    const readyPlan = buildTrainingPlan({
      goal: "Support voice",
      catalog,
      datasets: [dataset],
      capabilities: vertex,
    });
    const ready = launchReadiness(readyPlan, [dataset], vertex, catalog);
    expect(ready.ok).toBe(true);
    expect(plannerChatCards(readyPlan, ready)).toEqual(["plan", "launch"]);
  });
});

describe("collectBlockers / honesty", () => {
  test("Vertex honesty names supervised tuning for Gemini SFT", () => {
    expect(trainerHonesty({ ...emptyCapabilities(), vertex: true, hasRealTrainer: true }, "sft", "gemini-2.5-flash")).toContain(
      "supervised tuning"
    );
  });

  test("Together is preferred in the runner when the key is set", () => {
    expect(trainerHonesty({ ...emptyCapabilities(), together: true, vertex: true, hasRealTrainer: true }, "sft", "gemini-2.5-flash")).toContain(
      "Together"
    );
  });

  test("empty dataset is a hard block", () => {
    const blockers = collectBlockers({
      plan: { baseModelId: "gemini-2.5-flash", method: "sft", adapter: "lora", datasetId: "ds-1", trainerPath: "vertex" },
      catalog,
      datasets: [{ ...dataset, rowCount: 0, storageUri: null }],
      capabilities: { ...emptyCapabilities(), vertex: true, hasRealTrainer: true },
      forLaunch: true,
    });
    expect(blockers.some((b) => b.code === "empty_dataset" && b.severity === "block")).toBe(true);
  });
});
