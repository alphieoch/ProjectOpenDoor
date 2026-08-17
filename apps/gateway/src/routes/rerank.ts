import { Hono } from "hono";
import { flattenMessageText } from "@opendoor/shared";
import { resolveProvider } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { debitUsage, usdToCents } from "../utils/billing.js";
import { logGatewayRequest } from "../lib/request-log.js";
import { estimateTokens } from "../utils/streaming.js";

const rerankRouter = new Hono();

rerankRouter.post("/", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const body = await c.req.json();

  if (!body.model) return c.json({ error: "Model is required" }, 400);
  if (!body.query) return c.json({ error: "Query is required" }, 400);
  if (!Array.isArray(body.documents) || body.documents.length === 0) {
    return c.json({ error: "documents must be a non-empty array" }, 400);
  }

  const resolved = await resolveProvider(body.model);
  if (!resolved) return c.json({ error: `Model not found: ${body.model}` }, 404);
  if (typeof resolved.provider.createRerank !== "function") {
    return c.json(
      { error: `Provider '${resolved.provider.slug}' does not support rerank` },
      400
    );
  }

  const started = Date.now();
  let result;
  try {
    result = await resolved.provider.createRerank({
      model: resolved.model,
      query: body.query,
      documents: body.documents,
      top_n: body.top_n,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Rerank failed" }, 502);
  }

  const promptTokens = estimateTokens(
    `${body.query} ${body.documents.map((d: unknown) => flattenMessageText(d)).join(" ")}`
  );
  const billingContext = c.get("billingContext") || {
    plan: organization.plan || "free",
    family: "open_weight",
    useFromPlan: false,
    useFromCredits: true,
  };
  let costUsd = 0;
  try {
    const cost = await calculateCost({
      providerSlug: resolved.provider.slug,
      modelId: body.model,
      promptTokens,
      completionTokens: 0,
      plan: billingContext.plan,
      family: billingContext.family || "open_weight",
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
    /* pricing optional */
  }

  await logGatewayRequest({
    apiKeyId: apiKey.id,
    organizationId: organization.id,
    providerSlug: resolved.provider.slug,
    modelId: body.model,
    requestType: "rerank",
    promptTokens,
    latencyMs: Date.now() - started,
    costUsd,
  });

  return c.json({
    object: "list",
    model: body.model,
    results: result.results,
    usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
  });
});

export default rerankRouter;
