import { flattenMessageText, getPlan, type ChatMessage } from "@opendoor/shared";
import { resolveProvider } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { debitUsage, usdToCents } from "../utils/billing.js";
import { logGatewayRequest } from "./request-log.js";
import { db, apiKeys } from "@opendoor/database";
import { eq, sql } from "drizzle-orm";

export type BilledChatParams = {
  organization: { id: string; plan?: string | null };
  apiKey: { id: string };
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: unknown;
  tool_choice?: unknown;
  response_format?: unknown;
  metadata?: Record<string, unknown>;
};

export type BilledChatResult = {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: unknown; tool_calls?: unknown };
    finish_reason: string | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  provider?: string;
};

function inferFamily(modelId: string, providerSlug?: string): "closed" | "open_weight" {
  const model = modelId.toLowerCase();
  const provider = (providerSlug || "").toLowerCase();
  if (
    provider === "deepseek" ||
    provider === "qwen" ||
    provider === "mistral" ||
    provider === "custom" ||
    provider === "ollama" ||
    provider === "together" ||
    provider === "groq" ||
    model.startsWith("custom:") ||
    model.startsWith("premium:") ||
    model.startsWith("ollama:") ||
    model.includes("llama") ||
    model.includes("deepseek") ||
    model.includes("qwen") ||
    model.includes("mistral")
  ) {
    return "open_weight";
  }
  return "closed";
}

export async function runBilledChat(params: BilledChatParams): Promise<BilledChatResult> {
  const resolved = await resolveProvider(params.model);
  if (!resolved) {
    const err = new Error(`Model not found: ${params.model}`);
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  const started = Date.now();
  const providerSlug = resolved.provider.slug;
  const family = inferFamily(params.model, providerSlug);
  const plan = getPlan(params.organization.plan).id;

  const completion = await resolved.provider.chatCompletion({
    model: resolved.model,
    messages: params.messages,
    temperature: params.temperature,
    max_tokens: params.max_tokens,
    top_p: params.top_p,
    tools: params.tools as never,
    tool_choice: params.tool_choice as never,
    response_format: params.response_format as never,
  });

  const promptTokens = Number(completion.usage?.prompt_tokens || 0);
  const completionTokens = Number(completion.usage?.completion_tokens || 0);
  const totalTokens = Number(completion.usage?.total_tokens || promptTokens + completionTokens);

  let costUsd = 0;
  try {
    const cost = await calculateCost({
      providerSlug,
      modelId: params.model,
      promptTokens,
      completionTokens,
      region: process.env.GCP_REGION || process.env.AZURE_REGION || "global",
      plan,
      family,
    });
    costUsd = cost.totalCost;
  } catch {
    /* pricing missing — still return the completion */
  }

  await logGatewayRequest({
    apiKeyId: params.apiKey.id,
    organizationId: params.organization.id,
    providerSlug,
    modelId: params.model,
    requestType: "chat",
    promptTokens,
    completionTokens,
    latencyMs: Date.now() - started,
    costUsd,
    metadata: params.metadata,
  });

  if (costUsd > 0) {
    try {
      await debitUsage(params.organization.id, costUsd, undefined, {
        plan,
        family,
        providerSlug,
        useFromPlan: false,
        useFromCredits: true,
      });
      const costCents = usdToCents(costUsd);
      if (costCents > 0) {
        await db
          .update(apiKeys)
          .set({ spendUsedUsdCents: sql`${apiKeys.spendUsedUsdCents} + ${costCents}` })
          .where(eq(apiKeys.id, params.apiKey.id));
      }
    } catch (err) {
      console.error("[run-completion] debit failed", err);
    }
  }

  const choice = completion.choices?.[0];
  const content = choice?.message?.content ?? flattenMessageText(choice?.message?.content);
  return {
    id: completion.id || `chatcmpl_${Date.now().toString(36)}`,
    object: "chat.completion",
    created: completion.created || Math.floor(Date.now() / 1000),
    model: params.model,
    choices: [
      {
        index: 0,
        message: {
          role: choice?.message?.role || "assistant",
          content,
          ...(choice?.message?.tool_calls ? { tool_calls: choice.message.tool_calls } : {}),
        },
        finish_reason: choice?.finish_reason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
    provider: providerSlug,
  };
}
