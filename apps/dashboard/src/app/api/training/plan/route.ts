import { NextRequest, NextResponse } from "next/server";
import {
  HOUSE_CHAT_MODEL_ID,
  houseChatModelForMode,
} from "@opendoor/shared";
import { requireAuth } from "@/lib/auth";
import {
  assistantGatewayHeaders,
  assistantGatewaySecret,
  assistantGatewayUrl,
} from "@/lib/assistant-gateway";
import { ensureHouseChatSeat, incrementHouseChatUsage } from "@/lib/house-chat";
import { trainingCapabilities } from "@/lib/training/capabilities";
import { loadOrgDatasets, loadTrainableCatalog } from "@/lib/training/catalog";
import {
  buildTrainingPlan,
  extractJsonObject,
  type LlmPlanDraft,
  type TrainingPlan,
} from "@/lib/training/plan";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  try {
    const [catalog, datasets] = await Promise.all([
      loadTrainableCatalog(),
      loadOrgDatasets(orgId),
    ]);
    return NextResponse.json({
      capabilities: trainingCapabilities(),
      catalog,
      datasets,
    });
  } catch (err) {
    console.error("[training/plan GET]", err);
    return NextResponse.json(
      { error: "Failed to load training catalog", capabilities: trainingCapabilities(), catalog: [], datasets: [] },
      { status: 500 }
    );
  }
}

function plannerSystemPrompt(catalog: { id: string; label?: string }[], datasets: { id: string; name: string; purpose: string; rowCount: number }[]) {
  const catalogLines = catalog.length
    ? catalog.map((m) => `- ${m.id}${m.label && m.label !== m.id ? ` (${m.label})` : ""}`).join("\n")
    : "- (empty — do not invent a model id)";
  const datasetLines = datasets.length
    ? datasets.map((d) => `- ${d.id} ${d.name} purpose=${d.purpose} rows=${d.rowCount}`).join("\n")
    : "- (none uploaded)";
  return `You are OpenDoor Training's planner. Propose a fine-tune the stack can actually run.

Return ONLY JSON:
{
  "jobName": "short name",
  "summary": "1-2 sentences",
  "baseModelId": "exact catalog id",
  "method": "sft|dpo|orpo|rft|grpo",
  "adapter": "lora|full",
  "datasetId": "existing id or null",
  "evalCriteria": ["plain language check"],
  "epochs": 3,
  "learning_rate": 0.0001,
  "batch_size": 4,
  "lora_rank": 8,
  "datasetNotes": "what columns / how many rows"
}

Rules:
- baseModelId MUST be one of the catalog ids below. Never invent ids. Prefer Gemini/Gemma for Vertex SFT.
- Default method is sft and adapter is lora. Only pick dpo/orpo if the user has preference data. rft/grpo need a CustomJob image this stack often lacks.
- Do not claim GPU clusters, local Mac training, or continued pretrain as a real trainer path.
- If the catalog is empty, still describe the dataset shape and leave baseModelId empty.
- epochs 1-10, learning_rate around 1e-4, batch_size 1-32.

Trainable catalog:
${catalogLines}

Existing datasets:
${datasetLines}`;
}

async function planWithGateway(opts: {
  orgId: string;
  userId: string;
  goal: string;
  catalog: { id: string; label?: string }[];
  datasets: { id: string; name: string; purpose: string; rowCount: number }[];
}): Promise<{ draft: LlmPlanDraft | null; source: "ai" | "heuristic"; note: string | null }> {
  const secret = assistantGatewaySecret();
  if (!secret) {
    return {
      draft: null,
      source: "heuristic",
      note: "AI planner is off (missing GATEWAY_INTERNAL_KEY). Using catalog rules so you are not stuck.",
    };
  }

  const model = houseChatModelForMode("auto") || HOUSE_CHAT_MODEL_ID;
  let upstream: Response;
  try {
    upstream = await fetch(`${assistantGatewayUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: assistantGatewayHeaders(opts.orgId, {
        "X-OpenDoor-House-Chat": "1",
        "X-OpenDoor-House-Chat-Mode": "auto",
        "X-OpenDoor-User-Id": opts.userId,
      }),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: "system", content: plannerSystemPrompt(opts.catalog, opts.datasets) },
          { role: "user", content: opts.goal },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gateway unreachable";
    return {
      draft: null,
      source: "heuristic",
      note: `Could not reach the planner model (${message}). Using catalog rules so you can keep going.`,
    };
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    return {
      draft: null,
      source: "heuristic",
      note: `Planner model unavailable (${upstream.status}). ${errText.slice(0, 180) || "Using catalog rules."}`,
    };
  }

  const json = (await upstream.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const content = json?.choices?.[0]?.message?.content || "";
  const draft = extractJsonObject(content);
  if (!draft) {
    return {
      draft: null,
      source: "heuristic",
      note: "The planner replied without JSON. Using catalog rules instead.",
    };
  }
  return { draft, source: "ai", note: null };
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json().catch(() => ({}));
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (!goal) {
    return NextResponse.json({ error: "Describe what the model should be good at." }, { status: 400 });
  }

  const [catalog, datasets] = await Promise.all([
    loadTrainableCatalog().catch(() => []),
    loadOrgDatasets(orgId).catch(() => []),
  ]);
  const capabilities = trainingCapabilities();
  const selectedDatasetId =
    typeof body.datasetId === "string" && body.datasetId.trim() ? body.datasetId.trim() : null;

  let allowanceNote: string | null = null;
  if (!session.isSiteAdmin) {
    try {
      await ensureHouseChatSeat({
        userId: session.userId,
        orgId,
        email: session.email,
      });
      await incrementHouseChatUsage(session.userId, orgId);
    } catch (err) {
      const retryAfterSeconds =
        err && typeof err === "object" && "retryAfterSeconds" in err
          ? Number((err as { retryAfterSeconds?: number }).retryAfterSeconds || 0)
          : 0;
      allowanceNote = retryAfterSeconds
        ? `AI planner is paused for ${retryAfterSeconds}s (chat allowance). Using catalog rules so you can keep going.`
        : "AI planner is paused (chat allowance). Using catalog rules so you can keep going.";
    }
  }

  const llm = allowanceNote
    ? { draft: null as LlmPlanDraft | null, source: "heuristic" as const, note: allowanceNote }
    : await planWithGateway({
        orgId,
        userId: session.userId,
        goal,
        catalog,
        datasets,
      });

  const plan: TrainingPlan = buildTrainingPlan({
    goal,
    catalog,
    datasets,
    capabilities,
    draft: llm.draft,
    selectedDatasetId,
  });

  return NextResponse.json({
    plan,
    capabilities,
    catalog,
    datasets,
    source: llm.source,
    note: llm.note || allowanceNote,
  });
}
