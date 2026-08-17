/**
 * Idempotent upsert: Together serverless launch set + GPU SKUs + embedding rates.
 * Safe on an already-seeded DB. Usage: bun run scripts/seed-serverless.ts
 */
import { db } from "../packages/database/src/index.ts";
import {
  providers,
  models,
  pricingRules,
  gpuSkus,
  modelCatalog,
} from "../packages/database/src/index.ts";
import { eq, and, sql } from "drizzle-orm";

const SERVERLESS_MODELS = [
  {
    modelId: "llama-3.1-8b-instruct",
    displayName: "Llama 3.1 8B Instruct",
    contextWindow: 128000,
    origin: "us",
    hfRepo: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    input: 0.00018,
    output: 0.00018,
    markup: 15,
  },
  {
    modelId: "llama-3.1-70b-instruct",
    displayName: "Llama 3.1 70B Instruct",
    contextWindow: 128000,
    origin: "us",
    hfRepo: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    input: 0.00088,
    output: 0.00088,
    markup: 15,
  },
  {
    modelId: "qwen2.5-7b-instruct",
    displayName: "Qwen 2.5 7B Instruct",
    contextWindow: 128000,
    origin: "cn",
    hfRepo: "Qwen/Qwen2.5-7B-Instruct",
    input: 0.0003,
    output: 0.0003,
    markup: 15,
  },
  {
    modelId: "qwen2.5-72b-instruct",
    displayName: "Qwen 2.5 72B Instruct",
    contextWindow: 128000,
    origin: "cn",
    hfRepo: "Qwen/Qwen2.5-72B-Instruct",
    input: 0.0012,
    output: 0.0012,
    markup: 15,
  },
  {
    modelId: "deepseek-v3",
    displayName: "DeepSeek V3",
    contextWindow: 64000,
    origin: "cn",
    hfRepo: "deepseek-ai/DeepSeek-V3",
    input: 0.00125,
    output: 0.00125,
    markup: 15,
  },
  {
    modelId: "mistral-7b-instruct",
    displayName: "Mistral 7B Instruct",
    contextWindow: 32768,
    origin: "eu",
    hfRepo: "mistralai/Mistral-7B-Instruct-v0.3",
    input: 0.0002,
    output: 0.0002,
    markup: 15,
  },
] as const;

const EMBEDDING = {
  modelId: "BAAI/bge-base-en-v1.5",
  displayName: "BGE Base EN v1.5",
  input: 0.000008,
  markup: 15,
};

const GPU_ROWS = [
  { sku: "nvidia-l4", displayName: "NVIDIA L4", hourlyUsd: "1.2900", regionMultiplier: "1.00", sortOrder: 10 },
  { sku: "nvidia-a100", displayName: "NVIDIA A100 80GB", hourlyUsd: "6.2500", regionMultiplier: "1.00", sortOrder: 20 },
  { sku: "nvidia-h100", displayName: "NVIDIA H100 80GB", hourlyUsd: "13.5000", regionMultiplier: "1.25", sortOrder: 30 },
];

async function ensureTogetherProvider(): Promise<string> {
  const existing = await db
    .select()
    .from(providers)
    .where(eq(providers.slug, "together"))
    .limit(1);
  if (existing[0]) {
    await db
      .update(providers)
      .set({ enabled: true, name: "Together (serverless)", updatedAt: new Date() })
      .where(eq(providers.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db
    .insert(providers)
    .values({
      name: "Together (serverless)",
      slug: "together",
      apiKeyEnvVar: "TOGETHER_API_KEY",
      enabled: true,
      isWestern: true,
    })
    .returning();
  return row.id;
}

async function upsertModel(providerId: string, m: (typeof SERVERLESS_MODELS)[number]) {
  const existing = await db
    .select()
    .from(models)
    .where(and(eq(models.providerId, providerId), eq(models.modelId, m.modelId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(models)
      .set({
        displayName: m.displayName,
        contextWindow: m.contextWindow,
        family: "open_weight",
        deploymentStatus: "live",
        serverless: true,
        origin: m.origin,
        source: "provider_api",
        huggingFaceRepo: m.hfRepo,
        enabled: true,
        updatedAt: new Date(),
      })
      .where(eq(models.id, existing[0].id));
  } else {
    await db.insert(models).values({
      providerId,
      modelId: m.modelId,
      displayName: m.displayName,
      contextWindow: m.contextWindow,
      family: "open_weight",
      deploymentStatus: "live",
      serverless: true,
      origin: m.origin,
      source: "provider_api",
      huggingFaceRepo: m.hfRepo,
      enabled: true,
    });
  }

  const catalog = await db
    .select()
    .from(modelCatalog)
    .where(eq(modelCatalog.modelId, m.modelId))
    .limit(1);
  if (catalog[0]) {
    await db
      .update(modelCatalog)
      .set({
        displayName: m.displayName,
        huggingFaceRepo: m.hfRepo,
        serverless: true,
        deploymentStatus: "live",
        origin: m.origin,
        enabled: true,
      })
      .where(eq(modelCatalog.id, catalog[0].id));
  } else {
    await db.insert(modelCatalog).values({
      modelId: m.modelId,
      displayName: m.displayName,
      description: "Serverless open-weight — no GPU deploy step",
      huggingFaceRepo: m.hfRepo,
      inferenceEngine: "together",
      serverless: true,
      deploymentStatus: "live",
      origin: m.origin,
      source: "huggingface",
      enabled: true,
    });
  }
}

async function upsertPricing(
  providerId: string,
  modelId: string,
  input: number,
  output: number,
  markup: number,
  modality: "chat" | "embedding"
) {
  const finalInput = input * (1 + markup / 100);
  const finalOutput = output * (1 + markup / 100);
  const cached = input * 0.5;
  const finalCached = finalInput * 0.5;

  const existing = await db
    .select()
    .from(pricingRules)
    .where(
      and(
        eq(pricingRules.providerId, providerId),
        eq(pricingRules.modelId, modelId),
        eq(pricingRules.region, "global")
      )
    )
    .limit(1);

  const values = {
    inputCostPer1K: input.toString(),
    outputCostPer1K: output.toString(),
    cachedInputCostPer1K: cached.toString(),
    markupPercent: markup.toString(),
    finalInputCostPer1K: finalInput.toString(),
    finalOutputCostPer1K: finalOutput.toString(),
    finalCachedInputCostPer1K: finalCached.toString(),
    batchMultiplier: "0.50",
    modality,
  };

  if (existing[0]) {
    await db.update(pricingRules).set(values).where(eq(pricingRules.id, existing[0].id));
  } else {
    await db.insert(pricingRules).values({
      providerId,
      modelId,
      region: "global",
      ...values,
    });
  }
}

async function main() {
  console.log("Seeding serverless commercial surface…");
  const togetherId = await ensureTogetherProvider();

  for (const m of SERVERLESS_MODELS) {
    await upsertModel(togetherId, m);
    await upsertPricing(togetherId, m.modelId, m.input, m.output, m.markup, "chat");
    console.log(`  ✓ ${m.modelId}`);
  }

  // Embedding model
  const embExisting = await db
    .select()
    .from(models)
    .where(and(eq(models.providerId, togetherId), eq(models.modelId, EMBEDDING.modelId)))
    .limit(1);
  if (!embExisting[0]) {
    await db.insert(models).values({
      providerId: togetherId,
      modelId: EMBEDDING.modelId,
      displayName: EMBEDDING.displayName,
      contextWindow: 512,
      family: "open_weight",
      deploymentStatus: "live",
      serverless: true,
      origin: "global",
      source: "provider_api",
      huggingFaceRepo: EMBEDDING.modelId,
      enabled: true,
    });
  } else {
    await db
      .update(models)
      .set({ serverless: true, deploymentStatus: "live", family: "open_weight", enabled: true })
      .where(eq(models.id, embExisting[0].id));
  }
  await upsertPricing(
    togetherId,
    EMBEDDING.modelId,
    EMBEDDING.input,
    0,
    EMBEDDING.markup,
    "embedding"
  );
  console.log(`  ✓ ${EMBEDDING.modelId} (embedding)`);

  for (const g of GPU_ROWS) {
    const existing = await db.select().from(gpuSkus).where(eq(gpuSkus.sku, g.sku)).limit(1);
    if (existing[0]) {
      await db
        .update(gpuSkus)
        .set({
          displayName: g.displayName,
          hourlyUsd: g.hourlyUsd,
          regionMultiplier: g.regionMultiplier,
          sortOrder: g.sortOrder,
          enabled: true,
        })
        .where(eq(gpuSkus.id, existing[0].id));
    } else {
      await db.insert(gpuSkus).values(g);
    }
    console.log(`  ✓ GPU ${g.sku} @ $${g.hourlyUsd}/hr`);
  }

  // Backfill cached columns on all pricing rules
  await db.execute(sql`
    UPDATE pricing_rules SET
      cached_input_cost_per_1k = COALESCE(cached_input_cost_per_1k, input_cost_per_1k * 0.5),
      final_cached_input_cost_per_1k = COALESCE(final_cached_input_cost_per_1k, final_input_cost_per_1k * 0.5),
      batch_multiplier = COALESCE(batch_multiplier, 0.50),
      modality = COALESCE(NULLIF(modality, ''), 'chat')
  `);

  console.log("✅ Serverless seed complete. Vertex ADC/project routes MaaS ids; TOGETHER_API_KEY is optional overflow.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
