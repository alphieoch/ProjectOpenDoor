// @ts-nocheck
import { db } from "@opendoor/database";
import { pricingRules, providers, fineTunedModels } from "@opendoor/database";
import { eq, and, sql } from "drizzle-orm";
import { getPlan, type PlanId } from "@opendoor/shared";

export type BillingPlan = PlanId;
export type ModelFamily = "closed" | "open_weight";

export function getMarkupPercent(plan: BillingPlan, family: ModelFamily): number {
  return getPlan(plan).markupByFamily[family];
}

export interface CalculatedCost {
  inputCost: number;
  outputCost: number;
  cachedInputCost: number;
  totalCost: number;
  baseInputCost: number;
  baseOutputCost: number;
  baseCachedInputCost: number;
  baseTotalCost: number;
  markupPercent: number;
  plan: BillingPlan;
  family: ModelFamily;
  promptTokens: number;
  cachedTokens: number;
  uncachedPromptTokens: number;
}

interface CalculateCostInput {
  providerSlug: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  /** Prompt tokens served from provider prompt cache */
  cachedTokens?: number;
  region?: string;
  plan?: BillingPlan;
  family?: ModelFamily;
  /** Batch jobs bill at batch_multiplier (default 0.5) */
  batch?: boolean;
  serviceTier?: "standard" | "priority";
}

export async function calculateCost({
  providerSlug: providerSlugIn,
  modelId,
  promptTokens,
  completionTokens,
  cachedTokens = 0,
  region = "global",
  plan = "free",
  family = "closed",
  batch = false,
  serviceTier = "standard",
}: CalculateCostInput): Promise<CalculatedCost> {
  // Fireworks-style: fine-tunes bill at base model list price when bill_as_base
  let billModelId = modelId;
  let providerSlug = providerSlugIn;
  if (modelId.startsWith("ft:")) {
    const ft = await db
      .select()
      .from(fineTunedModels)
      .where(
        and(eq(fineTunedModels.modelId, modelId), eq(fineTunedModels.status, "active"))
      )
      .limit(1);
    if (ft[0]?.billAsBase) {
      billModelId = ft[0].baseModelId;
      if (ft[0].providerSlug) {
        providerSlug = ft[0].providerSlug;
      }
    }
  }

  const providerRows = await db
    .select()
    .from(providers)
    .where(eq(providers.slug, providerSlug))
    .limit(1);

  const provider = providerRows[0];
  if (!provider) {
    throw new Error(`Provider not found: ${providerSlug}`);
  }

  const ruleRows = await db
    .select()
    .from(pricingRules)
    .where(
      and(
        eq(pricingRules.providerId, provider.id),
        eq(pricingRules.modelId, billModelId),
        eq(pricingRules.region, region),
        sql`${pricingRules.effectiveFrom} <= NOW()`,
        sql`(${pricingRules.effectiveTo} IS NULL OR ${pricingRules.effectiveTo} > NOW())`
      )
    )
    .orderBy(sql`${pricingRules.effectiveFrom} desc`)
    .limit(1);

  let rule = ruleRows[0];

  if (!rule) {
    const globalRuleRows = await db
      .select()
      .from(pricingRules)
      .where(
        and(
          eq(pricingRules.providerId, provider.id),
          eq(pricingRules.modelId, billModelId),
          eq(pricingRules.region, "global"),
          sql`${pricingRules.effectiveFrom} <= NOW()`,
          sql`(${pricingRules.effectiveTo} IS NULL OR ${pricingRules.effectiveTo} > NOW())`
        )
      )
      .orderBy(sql`${pricingRules.effectiveFrom} desc`)
      .limit(1);

    rule = globalRuleRows[0];

    if (!rule) {
      throw new Error(
        `No pricing rule found for ${providerSlug}/${billModelId} in ${region}`
      );
    }
  }

  const cached = Math.min(Math.max(0, cachedTokens), Math.max(0, promptTokens));
  const uncached = Math.max(0, promptTokens - cached);

  const inputRate = Number(rule.inputCostPer1K);
  const outputRate = Number(rule.outputCostPer1K);
  const cachedRate =
    rule.cachedInputCostPer1K != null
      ? Number(rule.cachedInputCostPer1K)
      : inputRate * 0.5;

  let baseUncachedCost = (uncached / 1000) * inputRate;
  let baseCachedCost = (cached / 1000) * cachedRate;
  let baseOutputCost = (completionTokens / 1000) * outputRate;

  if (batch) {
    const mult = Number(rule.batchMultiplier ?? 0.5);
    baseUncachedCost *= mult;
    baseCachedCost *= mult;
    baseOutputCost *= mult;
  }

  const baseInputCost = baseUncachedCost + baseCachedCost;
  const markupPercent = getMarkupPercent(plan, family);
  const multiplier = 1 + markupPercent / 100;
  const priorityMult = serviceTier === "priority" ? 1.25 : 1;
  const inputCost = baseUncachedCost * multiplier * priorityMult;
  const cachedInputCost = baseCachedCost * multiplier * priorityMult;
  const outputCost = baseOutputCost * multiplier * priorityMult;

  return {
    inputCost,
    cachedInputCost,
    outputCost,
    totalCost: inputCost + cachedInputCost + outputCost,
    baseInputCost,
    baseCachedInputCost: baseCachedCost,
    baseOutputCost,
    baseTotalCost: baseInputCost + baseOutputCost,
    markupPercent,
    plan,
    family,
    promptTokens,
    cachedTokens: cached,
    uncachedPromptTokens: uncached,
  };
}
