// @ts-nocheck
import { Hono } from "hono";
import { db, requests, providers } from "@opendoor/database";
import { instantiateProvider, resolveProvider } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { debitUsage } from "../utils/billing.js";
import { eq } from "drizzle-orm";
import { alwaysUseSlugs, loadOrgProviderKeys, touchOrgProviderKeyUsed } from "../lib/byok.js";
import { applyModelRouting } from "../lib/model-aliases.js";
import { applyProviderRouting } from "../lib/provider-routing.js";
import { getRankedProviders } from "../lib/smart-router.js";
import { estimateTokens } from "../utils/streaming.js";
import { asUuid } from "../lib/provider-id.js";

const embeddingsRouter = new Hono();

function embeddingPromptTokens(input: unknown): number {
  if (typeof input === "string") return estimateTokens(input);
  if (Array.isArray(input)) {
    return input.reduce((sum, part) => sum + estimateTokens(String(part ?? "")), 0);
  }
  return estimateTokens(String(input ?? ""));
}

embeddingsRouter.post("/", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const body = await c.req.json();

  if (!body.model) {
    return c.json({ error: "Model is required" }, 400);
  }
  if (body.input == null) {
    return c.json({ error: "Input is required" }, 400);
  }

  await applyModelRouting(body);

  const byokKeys = await loadOrgProviderKeys(organization.id);
  const resolved = await resolveProvider(body.model, {
    byokSlugs: [...byokKeys.keys()],
  });
  if (!resolved) {
    return c.json({ error: `Model not found: ${body.model}` }, 404);
  }

  const billingContext = c.get("billingContext") || {
    plan: organization.plan || "free",
    family: "closed",
    useFromPlan: false,
    useFromCredits: true,
  };
  const region = process.env.GCP_REGION || process.env.AZURE_REGION || "global";

  const ranked = await getRankedProviders(body.model, {
    promptTokens: embeddingPromptTokens(body.input),
    completionTokens: 0,
    plan: billingContext.plan,
    family: billingContext.family || "closed",
    region,
  });

  let chainSlugs = applyProviderRouting(ranked, body.provider, [
    ...alwaysUseSlugs(byokKeys),
    ...byokKeys.keys(),
  ]);
  if (alwaysUseSlugs(byokKeys).length > 0) {
    const prefer = alwaysUseSlugs(byokKeys).filter((s) => chainSlugs.includes(s));
    chainSlugs = [...prefer, ...chainSlugs.filter((s) => !prefer.includes(s))];
  }
  if (!chainSlugs.includes(resolved.provider.slug)) {
    chainSlugs.push(resolved.provider.slug);
  }

  const started = Date.now();
  let result;
  let usedSlug = resolved.provider.slug;
  let lastError: Error | null = null;

  for (const slug of chainSlugs) {
    const byok = byokKeys.get(slug);
    const provider = instantiateProvider(slug, byok?.plaintext);
    if (!provider || typeof provider.createEmbedding !== "function") continue;
    try {
      result = await provider.createEmbedding({
        model: resolved.model,
        input: body.input,
        encoding_format: body.encoding_format,
        dimensions: body.dimensions,
      });
      usedSlug = slug;
      if (byok) touchOrgProviderKeyUsed(byok.id);
      lastError = null;
      break;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || "Embedding failed");
    }
  }

  if (!result) {
    const msg = lastError?.message || `Provider '${resolved.provider.slug}' does not support embeddings`;
    const status = msg.includes("TOGETHER_API_KEY") || msg.includes("not configured") ? 503 : 502;
    return c.json({ error: msg, model: body.model }, status);
  }

  const promptTokens = result.usage?.prompt_tokens || result.usage?.total_tokens || 0;

  let costUsd = 0;
  try {
    const cost = await calculateCost({
      providerSlug: usedSlug,
      modelId: body.model,
      promptTokens,
      completionTokens: 0,
      region,
      plan: billingContext.plan,
      family: billingContext.family || "closed",
    });
    costUsd = cost.totalCost;
    await debitUsage(organization.id, costUsd, undefined, {
      plan: billingContext.plan,
      family: billingContext.family || "closed",
      providerSlug: usedSlug,
      useFromPlan: billingContext.useFromPlan,
      useFromCredits: billingContext.useFromCredits,
    });
  } catch {
    /* pricing missing — allow request */
  }

  let providerId: string | null = null;
  try {
    const rows = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.slug, usedSlug))
      .limit(1);
    providerId = asUuid(rows[0]?.id);
  } catch {
    /* ignore */
  }

  if (providerId) {
    try {
      await db.insert(requests).values({
        apiKeyId: apiKey.id,
        organizationId: organization.id,
        providerId,
        modelId: body.model,
        requestType: "embedding",
        promptTokens,
        completionTokens: 0,
        totalTokens: promptTokens,
        latencyMs: Date.now() - started,
        costUsd: costUsd.toString(),
        status: "success",
        region,
      });
    } catch (e) {
      console.error("[embeddings] request log failed", e);
    }
  }

  return c.json({
    object: "list",
    data: result.data,
    model: body.model,
    usage: result.usage || { prompt_tokens: promptTokens, total_tokens: promptTokens },
  });
});

export default embeddingsRouter;
