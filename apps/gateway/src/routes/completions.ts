import { Hono } from "hono";
import type { ChatCompletionRequest } from "@opendoor/shared";
import { resolveProvider } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { debitUsage, usdToCents } from "../utils/billing.js";
import { logGatewayRequest } from "../lib/request-log.js";
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
  const body = await c.req.json();

  if (!body.model) return c.json({ error: "Model is required" }, 400);
  if (body.prompt == null) return c.json({ error: "Prompt is required" }, 400);

  const resolved = await resolveProvider(body.model);
  if (!resolved) return c.json({ error: `Model not found: ${body.model}` }, 404);

  const chatReq = toChat(body);
  chatReq.model = resolved.model;
  const started = Date.now();

  if (body.stream) {
    const stream = await resolved.provider.chatCompletionStream(chatReq);
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
          const promptTokens = estimateTokens(
            Array.isArray(body.prompt) ? body.prompt.join("\n") : String(body.prompt)
          );
          const completionTokens = estimateTokens(text);
          try {
            const cost = await calculateCost({
              providerSlug: resolved.provider.slug,
              modelId: body.model,
              promptTokens,
              completionTokens,
            });
            await debitUsage({
              organizationId: organization.id,
              apiKeyId: apiKey.id,
              amountCents: usdToCents(cost.totalCost),
              useFromPlan: false,
              useFromCredits: true,
            });
            await logGatewayRequest({
              apiKeyId: apiKey.id,
              organizationId: organization.id,
              providerSlug: resolved.provider.slug,
              modelId: body.model,
              requestType: "completion",
              promptTokens,
              completionTokens,
              latencyMs: Date.now() - started,
              costUsd: cost.totalCost,
            });
          } catch {
            /* ignore billing on stream */
          }
        },
      }),
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
    );
  }

  const response = await resolved.provider.chatCompletion(chatReq);
  const text =
    typeof response.choices[0]?.message.content === "string"
      ? response.choices[0].message.content
      : "";
  const promptTokens = response.usage?.prompt_tokens || 0;
  const completionTokens = response.usage?.completion_tokens || 0;
  let costUsd = 0;
  try {
    const cost = await calculateCost({
      providerSlug: resolved.provider.slug,
      modelId: body.model,
      promptTokens,
      completionTokens,
    });
    costUsd = cost.totalCost;
    await debitUsage({
      organizationId: organization.id,
      apiKeyId: apiKey.id,
      amountCents: usdToCents(costUsd),
      useFromPlan: false,
      useFromCredits: true,
    });
  } catch {
    /* optional */
  }
  await logGatewayRequest({
    apiKeyId: apiKey.id,
    organizationId: organization.id,
    providerSlug: resolved.provider.slug,
    modelId: body.model,
    requestType: "completion",
    promptTokens,
    completionTokens,
    latencyMs: Date.now() - started,
    costUsd,
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
});

export default completionsRouter;
