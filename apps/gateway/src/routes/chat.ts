// @ts-nocheck
import { Hono } from "hono";
import { db, requests, providers } from "@opendoor/database";
import type { ChatCompletionRequest } from "@opendoor/shared";
import { resolveProvider } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { encodeSSE, encodeSSEDone } from "../utils/streaming.js";
import { recordTokens } from "../middleware/rate-limit.js";
import { estimateTokens } from "../utils/streaming.js";
import { eq } from "drizzle-orm";

const chatRouter = new Hono();

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

  const { provider, model } = resolved;

  // Lookup provider UUID for FK constraint
  const providerRows = await db
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.slug as any, provider.slug))
    .limit(1);
  const providerId = providerRows[0]?.id || provider.slug;

  try {
    if (body.stream) {
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");

      const stream = new ReadableStream({
        async start(controller) {
          let promptTokens = 0;
          let completionTokens = 0;
          const _streamId = `chatcmpl-${Date.now()}`;

          try {
            // Estimate prompt tokens
            promptTokens = body.messages.reduce(
              (sum, m) => sum + estimateTokens(m.content),
              0
            );

            const streamGenerator = await provider.chatCompletionStream({
              ...body,
              model,
            });

            for await (const chunk of streamGenerator) {
              // Count completion tokens from content
              for (const choice of chunk.choices) {
                if (choice.delta.content) {
                  completionTokens += estimateTokens(choice.delta.content);
                }
              }

              controller.enqueue(
                new TextEncoder().encode(encodeSSE(chunk))
              );
            }

            controller.enqueue(new TextEncoder().encode(encodeSSEDone()));

            // Log usage
            const totalTokens = promptTokens + completionTokens;
            let costUsd = 0;
            try {
              const cost = await calculateCost(
                provider.slug,
                model,
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
              providerId: providerId,
              modelId: model,
              requestType: "chat",
              promptTokens,
              completionTokens,
              totalTokens,
              latencyMs: Date.now() - startTime,
              costUsd: costUsd.toString(),
              status: "success",
              region,
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
              providerId: providerId,
              modelId: model,
              requestType: "chat",
              status: "error",
              errorMessage: error.message || "Stream error",
              latencyMs: Date.now() - startTime,
              costUsd: "0",
              region,
            });
          } finally {
            controller.close();
          }
        },
      });

      return c.body(stream);
    } else {
      const response = await provider.chatCompletion({ ...body, model });

      const promptTokens = response.usage.prompt_tokens;
      const completionTokens = response.usage.completion_tokens;
      const totalTokens = response.usage.total_tokens;

      let costUsd = 0;
      try {
        const cost = await calculateCost(
          provider.slug,
          model,
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
        providerId: providerId,
        modelId: model,
        requestType: "chat",
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs: Date.now() - startTime,
        costUsd: costUsd.toString(),
        status: "success",
        region,
      });

      await recordTokens(apiKey.keyPrefix, totalTokens);

      return c.json(response);
    }
  } catch (error: any) {
    await db.insert(requests).values({
      apiKeyId: apiKey.id,
      organizationId: organization.id,
      providerId: providerId,
      modelId: model,
      requestType: "chat",
      status: "error",
      errorMessage: error.message || "Unknown error",
      latencyMs: Date.now() - startTime,
      costUsd: "0",
      region,
    });

    return c.json(
      { error: error.message || "Internal server error" },
      500
    );
  }
});

export default chatRouter;
