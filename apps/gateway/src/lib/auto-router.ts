import { db, models, pricingRules, providers } from "@opendoor/database";
import type { ProviderPreferences } from "@opendoor/shared";
import { and, eq, or } from "drizzle-orm";
import { resolveProvider } from "../providers/index.js";
import { getRankedProviders } from "./smart-router.js";

const FALLBACK_MODELS = ["gemma-4-26b-a4b-it", "deepseek-v3.2", "llama3.2:3b"] as const;
const SKIP_ID = /embed|rerank|bge-|whisper|tts-|dall-e|imagen|veo-|gemini-[\w.-]*-image|moderation/i;

export interface AutoRouteResult {
  modelId: string;
  providerHints: ProviderPreferences;
}

const RANK_OPTS = {
  promptTokens: 512,
  completionTokens: 256,
  plan: "free" as const,
  family: "open_weight" as const,
  region: process.env.AZURE_REGION || process.env.GCP_REGION || "global",
};

async function pickFromCatalog(only?: string[]): Promise<string | null> {
  const onlySet = only?.length ? new Set(only) : null;
  const rows = await db
    .select({
      modelId: models.modelId,
      input: pricingRules.inputCostPer1K,
      output: pricingRules.outputCostPer1K,
    })
    .from(models)
    .innerJoin(providers, eq(models.providerId, providers.id))
    .leftJoin(
      pricingRules,
      and(
        eq(pricingRules.modelId, models.modelId),
        eq(pricingRules.providerId, providers.id)
      )
    )
    .where(
      and(
        eq(models.enabled, true),
        eq(models.deploymentStatus, "live"),
        eq(providers.enabled, true),
        or(eq(models.family, "open_weight"), eq(models.serverless, true))
      )
    );

  const cheapest = new Map<string, number>();
  for (const row of rows) {
    if (onlySet && !onlySet.has(row.modelId)) continue;
    if (SKIP_ID.test(row.modelId)) continue;
    const price = Number(row.input || 0) + Number(row.output || 0);
    const prev = cheapest.get(row.modelId);
    if (prev == null || price < prev) cheapest.set(row.modelId, price);
  }

  const ranked = Array.from(cheapest.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([modelId]) => modelId)
    .slice(0, 8);

  let firstResolvable: string | null = null;
  for (const modelId of ranked) {
    const resolved = await resolveProvider(modelId);
    if (!resolved) continue;
    if (!firstResolvable) firstResolvable = modelId;
    try {
      const providersRanked = await getRankedProviders(modelId, RANK_OPTS);
      const healthy = providersRanked.find((p) => p.canServe);
      if (healthy || providersRanked.length > 0) return modelId;
    } catch {
      return modelId;
    }
  }
  return firstResolvable;
}

async function firstResolvableFallback(): Promise<string> {
  for (const modelId of FALLBACK_MODELS) {
    try {
      const resolved = await resolveProvider(modelId);
      if (resolved) return modelId;
    } catch {
      /* try next */
    }
  }
  return FALLBACK_MODELS[0];
}

async function firstResolvable(candidates: string[]): Promise<string | null> {
  for (const modelId of candidates) {
    if (!modelId || SKIP_ID.test(modelId)) continue;
    try {
      const resolved = await resolveProvider(modelId);
      if (resolved) return modelId;
    } catch {
      /* try next */
    }
  }
  return candidates.find((id) => id && !SKIP_ID.test(id)) || null;
}

/** Pick a live serverless / open-weight model; cheapest healthy when catalog + ranks exist. */
export async function resolveAutoRoute(opts?: {
  candidates?: string[];
}): Promise<AutoRouteResult> {
  const providerHints: ProviderPreferences = { sort: "price" };
  const candidates = (opts?.candidates || []).filter(
    (id) => typeof id === "string" && id.trim().length > 0
  );

  if (candidates.length > 0) {
    try {
      const picked = await pickFromCatalog(candidates);
      if (picked) return { modelId: picked, providerHints };
    } catch {
      /* catalog query failed */
    }
    const fallback = await firstResolvable(candidates);
    return { modelId: fallback || candidates[0], providerHints };
  }

  try {
    const picked = await pickFromCatalog();
    if (picked) return { modelId: picked, providerHints };
  } catch {
    /* catalog query failed */
  }
  return { modelId: await firstResolvableFallback(), providerHints };
}
