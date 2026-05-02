import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { pricingRules, providers } from "@opendoor/database";
import { eq, and, sql, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireAuth();

  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") || "global";

  const db = getDb();
  const now = new Date();

  const rules = await db
    .select({
      id: pricingRules.id,
      modelId: pricingRules.modelId,
      region: pricingRules.region,
      inputCostPer1K: pricingRules.inputCostPer1K,
      outputCostPer1K: pricingRules.outputCostPer1K,
      markupPercent: pricingRules.markupPercent,
      finalInputCostPer1K: pricingRules.finalInputCostPer1K,
      finalOutputCostPer1K: pricingRules.finalOutputCostPer1K,
      providerName: providers.name,
      providerSlug: providers.slug,
    })
    .from(pricingRules)
    .innerJoin(providers, eq(pricingRules.providerId, providers.id))
    .where(
      and(
        eq(pricingRules.region, region),
        sql`${pricingRules.effectiveFrom} <= ${now}`,
        isNull(pricingRules.effectiveTo)
      )
    )
    .orderBy(pricingRules.modelId);

  return NextResponse.json({ rules });
}
