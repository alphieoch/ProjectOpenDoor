import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { pricingRules, providers, models, gpuSkus } from "@opendoor/database";
import { eq, and, lte, isNull, asc } from "drizzle-orm";
import { MarketingCtaBanner } from "@/components/marketing-page-shell";
import { PublicPricing } from "@/components/public-pricing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — OpenDoor",
  description:
    "No free plan. Pro $12/mo vs Perplexity $20. Top up $20+ and get $5 of open-weight credit.",
};

async function loadPricing() {
  const db = getDb();
  const now = new Date();
  const region = "global";

  const rules = await db
    .select({
      modelId: pricingRules.modelId,
      modality: pricingRules.modality,
      finalInputCostPer1K: pricingRules.finalInputCostPer1K,
      finalOutputCostPer1K: pricingRules.finalOutputCostPer1K,
      finalCachedInputCostPer1K: pricingRules.finalCachedInputCostPer1K,
      providerName: providers.name,
      family: models.family,
      serverless: models.serverless,
    })
    .from(pricingRules)
    .innerJoin(providers, eq(pricingRules.providerId, providers.id))
    .leftJoin(
      models,
      and(eq(models.modelId, pricingRules.modelId), eq(models.providerId, providers.id))
    )
    .where(
      and(
        eq(pricingRules.region, region),
        lte(pricingRules.effectiveFrom, now),
        isNull(pricingRules.effectiveTo)
      )
    )
    .orderBy(pricingRules.modelId);

  const toPer1M = (per1k: string | null | undefined) =>
    per1k == null ? null : Number(per1k) * 1000;

  const chat = rules
    .filter((r) => (r.modality || "chat") === "chat")
    .map((r) => {
      const input = toPer1M(r.finalInputCostPer1K)!;
      const output = toPer1M(r.finalOutputCostPer1K)!;
      const cached = toPer1M(r.finalCachedInputCostPer1K) ?? input * 0.5;
      return {
        modelId: r.modelId,
        provider: r.providerName,
        family: r.family || "closed",
        serverless: Boolean(r.serverless),
        inputPer1MUsd: input,
        cachedInputPer1MUsd: cached,
        outputPer1MUsd: output,
      };
    });

  const embeddings = rules
    .filter((r) => r.modality === "embedding")
    .map((r) => ({
      modelId: r.modelId,
      provider: r.providerName,
      serverless: Boolean(r.serverless),
      inputPer1MUsd: toPer1M(r.finalInputCostPer1K),
    }));

  const gpus = await db
    .select()
    .from(gpuSkus)
    .where(eq(gpuSkus.enabled, true))
    .orderBy(asc(gpuSkus.sortOrder));

  return {
    chat,
    embeddings,
    onDemandGpus: gpus.map((g) => ({
      sku: g.sku,
      displayName: g.displayName,
      hourlyUsd: Number(g.hourlyUsd),
      perSecondUsd: Number(g.hourlyUsd) / 3600,
      regionLockMultiplier: Number(g.regionMultiplier || 1),
    })),
    updatedAt: now.toISOString(),
  };
}

export default async function PublicPricingPage() {
  let data: Awaited<ReturnType<typeof loadPricing>> | null = null;
  try {
    data = await loadPricing();
  } catch (e) {
    console.error("[pricing]", e);
  }

  const serverless = (data?.chat || []).filter((r) => r.serverless);
  const openWeight = (data?.chat || []).filter((r) => r.family === "open_weight");
  const chat =
    serverless.length > 0
      ? serverless
      : openWeight.length > 0
        ? openWeight
        : (data?.chat || []).slice(0, 15);
  const embeddings = data?.embeddings || [];
  const gpus = data?.onDemandGpus || [];

  return (
    <article id="pricing-page">
      <PublicPricing
        chat={chat}
        embeddings={embeddings}
        gpus={gpus}
        updatedAt={data?.updatedAt}
      />
      <MarketingCtaBanner
        title="See how a request is billed"
        description="Auth, policy, routing, then metering — the same path for serverless and dedicated."
        href="/how-it-works"
        label="How it works"
      />
    </article>
  );
}
