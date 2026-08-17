import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { pricingRules, providers, models, gpuSkus } from "@opendoor/database";
import { eq, and, lte, isNull, asc } from "drizzle-orm";

/** Public pricing — no auth. Source of truth for /pricing (Fireworks-style commercial surface). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") || "global";
  const db = getDb();
  const now = new Date();

  const rules = await db
    .select({
      id: pricingRules.id,
      modelId: pricingRules.modelId,
      region: pricingRules.region,
      modality: pricingRules.modality,
      inputCostPer1K: pricingRules.inputCostPer1K,
      outputCostPer1K: pricingRules.outputCostPer1K,
      cachedInputCostPer1K: pricingRules.cachedInputCostPer1K,
      finalInputCostPer1K: pricingRules.finalInputCostPer1K,
      finalOutputCostPer1K: pricingRules.finalOutputCostPer1K,
      finalCachedInputCostPer1K: pricingRules.finalCachedInputCostPer1K,
      batchMultiplier: pricingRules.batchMultiplier,
      markupPercent: pricingRules.markupPercent,
      providerName: providers.name,
      providerSlug: providers.slug,
      family: models.family,
      serverless: models.serverless,
      deploymentStatus: models.deploymentStatus,
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
      const cached =
        toPer1M(r.finalCachedInputCostPer1K) ??
        (r.finalCachedInputCostPer1K == null ? input * 0.5 : toPer1M(r.finalCachedInputCostPer1K)!);
      return {
        modelId: r.modelId,
        provider: r.providerName,
        providerSlug: r.providerSlug,
        family: r.family || "closed",
        serverless: Boolean(r.serverless),
        status: r.deploymentStatus || "live",
        inputPer1MUsd: input,
        cachedInputPer1MUsd: cached,
        outputPer1MUsd: output,
        batchPer1MUsd: {
          input: input * Number(r.batchMultiplier || 0.5),
          output: output * Number(r.batchMultiplier || 0.5),
        },
        markupPercent: Number(r.markupPercent),
      };
    });

  const embeddings = rules
    .filter((r) => r.modality === "embedding")
    .map((r) => ({
      modelId: r.modelId,
      provider: r.providerName,
      providerSlug: r.providerSlug,
      serverless: Boolean(r.serverless),
      inputPer1MUsd: toPer1M(r.finalInputCostPer1K),
      markupPercent: Number(r.markupPercent),
    }));

  const gpus = await db
    .select()
    .from(gpuSkus)
    .where(eq(gpuSkus.enabled, true))
    .orderBy(asc(gpuSkus.sortOrder));

  return NextResponse.json({
    currency: "USD",
    unit: "per_1M_tokens",
    region,
    updatedAt: now.toISOString(),
    chat,
    embeddings,
    onDemandGpus: gpus.map((g) => ({
      sku: g.sku,
      displayName: g.displayName,
      hourlyUsd: Number(g.hourlyUsd),
      perSecondUsd: Number(g.hourlyUsd) / 3600,
      regionLockMultiplier: Number(g.regionMultiplier || 1),
      note:
        Number(g.regionMultiplier) > 1
          ? `Region lock (e.g. UK/EU residency) multiplies by ${g.regionMultiplier}x`
          : null,
    })),
    notes: [
      "Cached input tokens (provider-reported) bill at the cached rate (~50% of input).",
      "Prompt-cache affinity sticks successful provider routes for matching prompt prefixes.",
      "service_tier=priority raises RPM/TPM and skips load-shed; standard may 503 when GATEWAY_SHED_STANDARD=1.",
      "TPM unlocks with lifetime key spend ($10 / $100 / $1k / $10k) and plan multipliers.",
      "Serverless models need TOGETHER_API_KEY (Secret Manager: opendoor-together-api-key).",
      "On-demand GPUs are dedicated. Billed per GPU-second from gpu_skus.",
      "OpenDoor governance and UK/EU residency are the control plane Fireworks does not sell.",
    ],
  });
}
