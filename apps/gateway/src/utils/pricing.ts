import { db } from "@opendoor/database";
import { pricingRules, providers } from "@opendoor/database";
import { eq, and, sql } from "drizzle-orm";

export interface CalculatedCost {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  markupPercent: number;
}

export async function calculateCost(
  providerSlug: string,
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  region: string = "global"
): Promise<CalculatedCost> {
  const providerRows = await db
    .select()
    .from(providers)
    .where(eq(providers.slug as any, providerSlug))
    .limit(1);

  const provider = providerRows[0];
  if (!provider) {
    throw new Error(`Provider not found: ${providerSlug}`);
  }

  const now = new Date();

  const ruleRows = await db
    .select()
    .from(pricingRules)
    .where(
      and(
        eq(pricingRules.providerId as any, provider.id),
        eq(pricingRules.modelId as any, modelId),
        eq(pricingRules.region as any, region),
        sql`${pricingRules.effectiveFrom} <= ${now}`,
        sql`${pricingRules.effectiveTo} IS NULL`
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
          eq(pricingRules.providerId as any, provider.id),
          eq(pricingRules.modelId as any, modelId),
          eq(pricingRules.region as any, "global"),
          sql`${pricingRules.effectiveFrom} <= ${now}`,
          sql`${pricingRules.effectiveTo} IS NULL`
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

  const inputCost = (promptTokens / 1000) * Number(rule.finalInputCostPer1K);
  const outputCost =
    (completionTokens / 1000) * Number(rule.finalOutputCostPer1K);

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    markupPercent: Number(rule.markupPercent),
  };
}

export function applyMarkup(
  baseInputCost: number,
  baseOutputCost: number,
  markupPercent: number
): { finalInputCost: number; finalOutputCost: number } {
  const multiplier = 1 + markupPercent / 100;
  return {
    finalInputCost: baseInputCost * multiplier,
    finalOutputCost: baseOutputCost * multiplier,
  };
}
