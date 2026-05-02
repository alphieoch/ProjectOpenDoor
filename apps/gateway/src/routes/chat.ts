// @ts-nocheck
import { Hono } from "hono";
import { db, requests, providers } from "@opendoor/database";
import type { ChatCompletionRequest } from "@opendoor/shared";
import { resolveProvider, getProvider, getFallbackChain } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { encodeSSE, encodeSSEDone } from "../utils/streaming.js";
import { recordTokens } from "../middleware/rate-limit.js";
import { estimateTokens } from "../utils/streaming.js";
import { eq } from "drizzle-orm";

const chatRouter = new Hono();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryProvider(
  provider: any,
  model: string,
  body: ChatCompletionRequest,
  isStream: boolean
): Promise<{ response?: any; streamGenerator?: any; error?: Error }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (isStream) {
        const streamGenerator = await provider.chatCompletionStream({
          ...body,
          model,
        });
        return { streamGenerator };
      } else {
        const response = await provider.chatCompletion({ ...body, model });
        return { response };
      }
    } catch (err: any) {
      if (attempt < 2) {
        await sleep(100 * Math.pow(2, attempt));
      } else {
        return { error: err };
      }
    }
  }
  return { error: new Error("Max retries exceeded") };
}

chatRouter.post("/completions", async (c) => {
  const startTime = Date.now();
  const body = (await c.req.json()) as ChatCompletionRequest;
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const region = process.env.AZURE_REGION || "unknown";

  if (!body.model) {
    return c.json({ error: "Model is required" }, 400);
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return c.json({ error: "Messages are required" }, 400);
  }

  // Check model permissions
  const allowedModels = apiKey.allowedModels as string[] | null;
  if (allowedModels && allowedModels.length > 0) {
    if (!allowedModels.includes(body.model)) {
      return c.json(
        {
          error: `Model '${body.model}' is not allowed for this API key. Allowed models: ${allowedModels.join(", ")}`,
        },
        403
      );
    }
  }

  const resolved = await resolveProvider(body.model);
  if (!resolved) {
    return c.json({ error: `Model not found: ${body.model}` }, 404);
  }

  // Build fallback chain
  const chainSlugs = [resolved.provider.slug];
  const fallbacks = getFallbackChain(body.model);
  for (const slug of fallbacks) {
    if (slug !== resolved.provider.slug && !chainSlugs.includes(slug)) {
      chainSlugs.push(slug);
    }
  }

  let providerId: string | null = null;
  let lastError: Error | null = null;
  let usedProviderSlug = resolved.provider.slug;
  let fallbackFrom: string | null = null;

  // Try each provider in the chain
  for (let chainIndex = 0; chainIndex < chainSlugs.length; chainIndex++) {
    const slug = chainSlugs[chainIndex];
    const provider = getProvider(slug);
    if (!provider) continue;

    // Lookup provider UUID for FK constraint
    try {
      const providerRows = await db
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.slug as any, slug))
        .limit(1);
      providerId = providerRows[0]?.id || slug;
    } catch {
      providerId = slug;
    }

    if (chainIndex > 0) {
      fallbackFrom = chainSlugs[0];
      usedProviderSlug = slug;
    }

    const result = await tryProvider(provider, resolved.model, body, !!body.stream);

    if (result.error) {
      lastError = result.error;
      continue;
    }

    // Success — handle streaming or non-streaming
    try {
      if (body.stream && result.streamGenerator) {
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");

        const stream = new ReadableStream({
          async start(controller) {
            let promptTokens = 0;
            let completionTokens = 0;

            try {
              // Estimate prompt tokens
              promptTokens = body.messages.reduce(
                (sum, m) => sum + estimateTokens(m.content),
                0
              );

              for await (const chunk of result.streamGenerator) {
                for (const choice of chunk.choices) {
                  if (choice.delta && choice.delta.content) {
                    completionTokens += estimateTokens(choice.delta.content);
                  }
                }
                controller.enqueue(
                  new TextEncoder().encode(encodeSSE(chunk))
                );
              }

              controller.enqueue(new TextEncoder().encode(encodeSSEDone()));

              const totalTokens = promptTokens + completionTokens;
              let costUsd = 0;
              try {
                const cost = await calculateCost(
                  usedProviderSlug,
                  resolved.model,
                  promptTokens,
                  completionTokens,
                  region
                );
                costUsd = cost.totalCost;
              } catch {
                // pricing not configured
              }

              await db.insert(requests).values({
                apiKeyId: apiKey.id,
                organizationId: organization.id,
                providerId: providerId || usedProviderSlug,
                modelId: resolved.model,
                requestType: "chat",
                promptTokens,
                completionTokens,
                totalTokens,
                latencyMs: Date.now() - startTime,
                costUsd: costUsd.toString(),
                status: "success",
                region,
                metadata: fallbackFrom ? { fallbackFrom, providerChain: chainSlugs } : undefined,
              });

              await recordTokens(apiKey.keyPrefix, totalTokens);
            } catch (error: any) {
              controller.enqueue(
                new TextEncoder().encode(
                  encodeSSE({ error: error.message || "Stream error" })
                )
              );
              controller.enqueue(new TextEncoder().encode(encodeSSEDone()));

              await db.insert(requests).values({
                apiKeyId: apiKey.id,
                organizationId: organization.id,
                providerId: providerId || usedProviderSlug,
                modelId: resolved.model,
                requestType: "chat",
                status: "error",
                errorMessage: error.message || "Stream error",
                latencyMs: Date.now() - startTime,
                costUsd: "0",
                region,
                metadata: fallbackFrom ? { fallbackFrom, providerChain: chainSlugs } : undefined,
              });
            } finally {
              controller.close();
            }
          },
        });

        return c.body(stream);
      } else if (result.response) {
        const response = result.response;
        const promptTokens = response.usage.prompt_tokens;
        const completionTokens = response.usage.completion_tokens;
        const totalTokens = response.usage.total_tokens;

        let costUsd = 0;
        try {
          const cost = await calculateCost(
            usedProviderSlug,
            resolved.model,
            promptTokens,
            completionTokens,
            region
          );
          costUsd = cost.totalCost;
        } catch {
          // pricing not configured
        }

        await db.insert(requests).values({
          apiKeyId: apiKey.id,
          organizationId: organization.id,
          providerId: providerId || usedProviderSlug,
          modelId: resolved.model,
          requestType: "chat",
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs: Date.now() - startTime,
          costUsd: costUsd.toString(),
          status: "success",
          region,
          metadata: fallbackFrom ? { fallbackFrom, providerChain: chainSlugs } : undefined,
        });

        await recordTokens(apiKey.keyPrefix, totalTokens);

        return c.json(response);
      }
    } catch (error: any) {
      lastError = error;
      continue;
    }
  }

  // All providers failed
  await db.insert(requests).values({
    apiKeyId: apiKey.id,
    organizationId: organization.id,
    providerId: providerId || chainSlugs[0],
    modelId: resolved.model,
    requestType: "chat",
    status: "error",
    errorMessage: lastError?.message || "All providers failed",
    latencyMs: Date.now() - startTime,
    costUsd: "0",
    region,
    metadata: { providerChain: chainSlugs, allFailed: true },
  });

  return c.json(
    {
      error: "All providers failed",
      detail: lastError?.message || "No provider could handle the request",
      tried: chainSlugs,
    },
    502
  );
});

export default chatRouter;
