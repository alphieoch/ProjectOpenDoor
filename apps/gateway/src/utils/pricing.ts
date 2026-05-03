// @ts-nocheck
import { db } from "@opendoor/database";
import { pricingRules, providers } from "@opendoor/database";
import { eq, and, sql } from "drizzle-orm";

export type BillingPlan = "free" | "pro" | "enterprise";
export type ModelFamily = "closed" | "open_weight";

const MARKUP_TABLE: Record<ModelFamily, Record<BillingPlan, number>> = {
  closed: {
    free: 5,
    pro: 3,
    enterprise: 2,
  },
  open_weight: {
    free: 35,
    pro: 30,
    enterprise: 25,
  },
};

export interface CalculatedCost {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  baseInputCost: number;
  baseOutputCost: number;
  baseTotalCost: number;
  markupPercent: number;
  plan: BillingPlan;
  family: ModelFamily;
}

export function getMarkupPercent(plan: BillingPlan, family: ModelFamily): number {
  return MARKUP_TABLE[family]?.[plan] ?? MARKUP_TABLE.closed.free;
}

interface CalculateCostInput {
  providerSlug: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  region?: string;
  plan?: BillingPlan;
  family?: ModelFamily;
}

export async function calculateCost({
  providerSlug,
  modelId,
  promptTokens,
  completionTokens,
  region = "global",
  plan = "free",
  family = "closed",
}: CalculateCostInput): Promise<CalculatedCost> {
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
        eq(pricingRules.modelId, modelId),
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
          eq(pricingRules.modelId, modelId),
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
        `No pricing rule found for ${providerSlug}/${modelId} in ${region}`
      );
    }
  }

  const baseInputCost = (promptTokens / 1000) * Number(rule.inputCostPer1K);
  const baseOutputCost = (completionTokens / 1000) * Number(rule.outputCostPer1K);
  const markupPercent = getMarkupPercent(plan, family);
  const multiplier = 1 + markupPercent / 100;
  const inputCost = baseInputCost * multiplier;
  const outputCost = baseOutputCost * multiplier;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    baseInputCost,
    baseOutputCost,
    baseTotalCost: baseInputCost + baseOutputCost,
    markupPercent,
    plan,
    family,
  };
}
