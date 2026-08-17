import { Hono } from "hono";
import type { ChatCompletionRequest, ProviderPreferences } from "@opendoor/shared";
import { instantiateProvider, resolveProvider } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { debitUsage } from "../utils/billing.js";
import { appAttributionFromHeaders, logGatewayRequest } from "../lib/request-log.js";
import { applyModelRouting } from "../lib/model-aliases.js";
import { alwaysUseSlugs, loadOrgProviderKeys, touchOrgProviderKeyUsed } from "../lib/byok.js";
import { applyProviderRouting } from "../lib/provider-routing.js";
import { getRankedProviders } from "../lib/smart-router.js";
import { encodeSSE, encodeSSEDone, estimateTokens } from "../utils/streaming.js";

const completionsRouter = new Hono();

function toChat(body: {
  model: string;
  prompt: string | string[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  user?: string;
}): ChatCompletionRequest {
  const prompt = Array.isArray(body.prompt) ? body.prompt.join("\n") : body.prompt;
  return {
    model: body.model,
    messages: [{ role: "user", content: prompt }],
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    user: body.user,
  };
}

completionsRouter.post("/", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const body = ((c.get("chatRequestBody") as
    | {
        model?: string;
        prompt?: string | string[];
        temperature?: number;
        max_tokens?: number;
        top_p?: number;
        user?: string;
        stream?: boolean;
        provider?: ProviderPreferences;
      }
    | undefined) || (await c.req.json())) as {
    model?: string;
    prompt?: string | string[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    user?: string;
    stream?: boolean;
    provider?: ProviderPreferences;
  };

  if (!body.model) return c.json({ error: "Model is required" }, 400);
  if (body.prompt == null) return c.json({ error: "Prompt is required" }, 400);

  await applyModelRouting(body, {
    allowedModels: (apiKey as { allowedModels?: string[] | null }).allowedModels,
  });

  const byokKeys = await loadOrgProviderKeys(organization.id);
  const resolved = await resolveProvider(body.model, {
    byokSlugs: [...byokKeys.keys()],
  });
  if (!resolved) return c.json({ error: `Model not found: ${body.model}` }, 404);

  const chatReq = toChat({
    model: body.model,
    prompt: body.prompt as string | string[],
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    user: body.user,
  });
  chatReq.model = resolved.model;
  const started = Date.now();
  const appAttribution = appAttributionFromHeaders((n) => c.req.header(n));
  const billingContext = c.get("billingContext") || {
    plan: organization.plan || "free",
    family: "closed",
  };
  const region = process.env.GCP_REGION || process.env.AZURE_REGION || "global";
  const promptText = Array.isArray(body.prompt)
    ? (body.prompt as string[]).join("\n")
    : String(body.prompt);

  const ranked = await getRankedProviders(body.model, {
    promptTokens: estimateTokens(promptText),
    completionTokens:
      typeof body.max_tokens === "number" && body.max_tokens > 0 ? body.max_tokens : 256,
    plan: (billingContext.plan || "free") as "free" | "pro" | "team" | "enterprise",
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

  let lastError: Error | null = null;

  for (const slug of chainSlugs) {
    const byok = byokKeys.get(slug);
    const provider = instantiateProvider(slug, byok?.plaintext);
    if (!provider) continue;

    try {
      if (body.stream) {
        const stream = await provider.chatCompletionStream(chatReq);
        if (byok) touchOrgProviderKeyUsed(byok.id);
        return c.newResponse(
          new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              let text = "";
              try {
                for await (const chunk of stream) {
                  const delta = chunk.choices?.[0]?.delta?.content;
                  if (typeof delta === "string") text += delta;
                  const mapped = {
                    id: chunk.id.replace("chatcmpl", "cmpl"),
                    object: "text_completion",
                    created: chunk.created,
                    model: body.model,
                    choices: [
                      {
                        index: 0,
                        text: typeof delta === "string" ? delta : "",
                        finish_reason: chunk.choices?.[0]?.finish_reason || null,
                      },
                    ],
                  };
                  controller.enqueue(encoder.encode(encodeSSE(mapped)));
                }
                controller.enqueue(encoder.encode(encodeSSEDone()));
              } finally {
                controller.close();
              }
              const promptTokens = estimateTokens(promptText);
              const completionTokens = estimateTokens(text);
              try {
                const cost = await calculateCost({
                  providerSlug: slug,
                  modelId: String(body.model),
                  promptTokens,
                  completionTokens,
                });
                await debitUsage(organization.id, cost.totalCost, undefined, {
                  plan: (billingContext.plan || "free") as "free" | "pro" | "team" | "enterprise",
                  family: billingContext.family || "closed",
                  providerSlug: slug,
                  useFromPlan: false,
                  useFromCredits: true,
                });
                await logGatewayRequest({
                  apiKeyId: apiKey.id,
                  organizationId: organization.id,
                  providerSlug: slug,
                  modelId: String(body.model),
                  requestType: "completion",
                  promptTokens,
                  completionTokens,
                  latencyMs: Date.now() - started,
                  costUsd: cost.totalCost,
                  metadata: appAttribution,
                });
              } catch {
                /* ignore billing on stream */
              }
            },
          }),
          { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
        );
      }

      const response = await provider.chatCompletion(chatReq);
      if (byok) touchOrgProviderKeyUsed(byok.id);
      const text =
        typeof response.choices[0]?.message.content === "string"
          ? response.choices[0].message.content
          : "";
      const promptTokens = response.usage?.prompt_tokens || 0;
      const completionTokens = response.usage?.completion_tokens || 0;
      let costUsd = 0;
      try {
        const cost = await calculateCost({
          providerSlug: slug,
          modelId: String(body.model),
          promptTokens,
          completionTokens,
        });
        costUsd = cost.totalCost;
        await debitUsage(organization.id, costUsd, undefined, {
          plan: (billingContext.plan || "free") as "free" | "pro" | "team" | "enterprise",
          family: billingContext.family || "closed",
          providerSlug: slug,
          useFromPlan: false,
          useFromCredits: true,
        });
      } catch {
        /* optional */
      }
      await logGatewayRequest({
        apiKeyId: apiKey.id,
        organizationId: organization.id,
        providerSlug: slug,
        modelId: String(body.model),
        requestType: "completion",
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - started,
        costUsd,
        metadata: appAttribution,
      });

      return c.json({
        id: response.id.replace("chatcmpl", "cmpl"),
        object: "text_completion",
        created: response.created,
        model: body.model,
        choices: [
          {
            index: 0,
            text,
            finish_reason: response.choices[0]?.finish_reason === "length" ? "length" : "stop",
          },
        ],
        usage: response.usage,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  return c.json(
    { error: lastError?.message || `Model not found: ${body.model}` },
    lastError?.message?.includes("not configured") ? 503 : 502
  );
});

export default completionsRouter;
