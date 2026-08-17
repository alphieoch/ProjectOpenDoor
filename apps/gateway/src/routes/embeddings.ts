// @ts-nocheck
import { Hono } from "hono";
import { db, requests, providers } from "@opendoor/database";
import { resolveProvider } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { debitUsage, usdToCents } from "../utils/billing.js";
import { eq } from "drizzle-orm";

const embeddingsRouter = new Hono();

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

  const resolved = await resolveProvider(body.model);
  if (!resolved) {
    return c.json({ error: `Model not found: ${body.model}` }, 404);
  }

  const provider = resolved.provider;
  if (typeof provider.createEmbedding !== "function") {
    // Fall back to OpenAI-compatible fetch if provider exposes base URL via chat only
    return c.json(
      {
        error: `Provider '${provider.slug}' does not support embeddings`,
        model: body.model,
      },
      400
    );
  }

  const started = Date.now();
  let result;
  try {
    result = await provider.createEmbedding({
      model: resolved.model,
      input: body.input,
      encoding_format: body.encoding_format,
      dimensions: body.dimensions,
    });
  } catch (err: any) {
    const msg = err.message || "Embedding failed";
    const status = msg.includes("TOGETHER_API_KEY") ? 503 : 502;
    return c.json({ error: msg }, status);
  }

  const promptTokens = result.usage?.prompt_tokens || result.usage?.total_tokens || 0;
  const billingContext = c.get("billingContext") || {
    plan: organization.plan || "free",
    family: "closed",
    useFromPlan: false,
    useFromCredits: true,
  };

  let costUsd = 0;
  try {
    const cost = await calculateCost({
      providerSlug: provider.slug,
      modelId: body.model,
      promptTokens,
      completionTokens: 0,
      region: process.env.GCP_REGION || process.env.AZURE_REGION || "global",
      plan: billingContext.plan,
      family: billingContext.family || "closed",
    });
    costUsd = cost.totalCost;
    await debitUsage({
      organizationId: organization.id,
      apiKeyId: apiKey.id,
      amountCents: usdToCents(costUsd),
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
      .where(eq(providers.slug, provider.slug))
      .limit(1);
    providerId = rows[0]?.id || null;
  } catch {
    /* ignore */
  }

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
      region: process.env.GCP_REGION || process.env.AZURE_REGION || "global",
    });
  } catch (e) {
    console.error("[embeddings] request log failed", e);
  }

  return c.json({
    object: "list",
    data: result.data,
    model: body.model,
    usage: result.usage || { prompt_tokens: promptTokens, total_tokens: promptTokens },
  });
});

export default embeddingsRouter;
