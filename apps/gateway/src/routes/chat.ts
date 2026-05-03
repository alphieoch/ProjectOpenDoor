// @ts-nocheck
import { Hono } from "hono";
import { db, requests, providers, models } from "@opendoor/database";
import type { ChatCompletionRequest } from "@opendoor/shared";
import { resolveProvider, getProvider, getFallbackChain } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { encodeSSE, encodeSSEDone } from "../utils/streaming.js";
import { recordTokens } from "../middleware/rate-limit.js";
import { estimateTokens } from "../utils/streaming.js";
import { debitUsage, shouldUsePlanBudget, usdToCents } from "../utils/billing.js";
import { eq, and } from "drizzle-orm";
import {
  assistantChoicesFromText,
  captureAiGeneration,
  captureGatewayEvent,
  sanitizeMessagesForAi,
} from "../lib/posthog.js";

const chatRouter = new Hono();

function normalizeFamily(
  preferred: "closed" | "open_weight" | undefined,
  providerSlug: string
): "closed" | "open_weight" {
  if (preferred) return preferred;
  if (providerSlug === "deepseek" || providerSlug === "qwen" || providerSlug === "mistral") {
    return "open_weight";
  }
  return "closed";
}

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
  const body = ((c.get("chatRequestBody") as ChatCompletionRequest | undefined) ||
    ((await c.req.json()) as ChatCompletionRequest));
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const billingContext = c.get("billingContext");
  const region = process.env.AZURE_REGION || "unknown";
  const policyResult = c.get("policyResult");
  const dataClass = c.get("dataClass") || "internal";
  const overrideModel = c.get("overrideModel");

  // Apply policy fallback model override
  if (overrideModel) {
    body.model = overrideModel;
  }

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

  // Check if model exists and its deployment status
  const modelRows = await db
    .select({ deploymentStatus: models.deploymentStatus, displayName: models.displayName })
    .from(models)
    .where(eq(models.modelId, body.model))
    .limit(1);

  const modelStatus = modelRows[0]?.deploymentStatus || null;

  if (modelStatus === "available_on_request") {
    return c.json(
      {
        error: `Model '${body.model}' is available upon request`,
        message: `This model is not currently deployed. Contact your administrator to enable '${modelRows[0]?.displayName || body.model}'`,
        status: "available_on_request",
        model: body.model,
      },
      400
    );
  }

  if (modelStatus === "coming_soon") {
    return c.json(
      {
        error: `Model '${body.model}' is coming soon`,
        message: `'${modelRows[0]?.displayName || body.model}' will be available shortly. Check back soon or contact your administrator for early access.`,
        status: "coming_soon",
        model: body.model,
      },
      400
    );
  }

  const resolved = await resolveProvider(body.model);
  if (!resolved) {
    return c.json({ error: `Model not found: ${body.model}` }, 404);
  }

  // Pre-authorize affordability before provider execution.
  try {
    const promptTokensEstimate = body.messages.reduce((sum, m) => {
      const content =
        typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "");
      return sum + estimateTokens(content);
    }, 0);
    const completionEstimate =
      typeof body.max_tokens === "number" && body.max_tokens > 0 ? body.max_tokens : 1024;
    const requestFamily = normalizeFamily(
      billingContext?.family as "closed" | "open_weight" | undefined,
      resolved.provider.slug
    );
    const estimatedCost = await calculateCost({
      providerSlug: resolved.provider.slug,
      modelId: body.model,
      promptTokens: promptTokensEstimate,
      completionTokens: completionEstimate,
      region,
      plan: (billingContext?.plan || organization.plan || "free") as
        | "free"
        | "pro"
        | "enterprise",
      family: requestFamily,
    });
    const estimatedCostCents = usdToCents(estimatedCost.totalCost);
    const canUsePlan = await shouldUsePlanBudget(
      organization.id,
      (billingContext?.plan || organization.plan || "free") as
        | "free"
        | "pro"
        | "enterprise",
      estimatedCostCents
    );
    const credits = Number(organization.creditsUsdCents || 0);

    if (!canUsePlan && credits < estimatedCostCents) {
      return c.json(
        {
          error: "Insufficient balance",
          detail:
            "Your current 4-hour plan allowance and prepaid credits cannot cover this request estimate.",
          estimatedCostUsd: estimatedCost.totalCost,
          creditsUsdCents: credits,
          topupUrl: `${
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          }/dashboard/billing`,
        },
        402
      );
    }
  } catch {
    // If cost estimate is unavailable, do not block the request.
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
            let assistantText = "";
            let firstTokenAt: number | null = null;

            try {
              // Estimate prompt tokens
              promptTokens = body.messages.reduce(
                (sum, m) => sum + estimateTokens(m.content),
                0
              );

              for await (const chunk of result.streamGenerator) {
                for (const choice of chunk.choices) {
                  if (choice.delta && choice.delta.content) {
                    if (firstTokenAt === null) firstTokenAt = Date.now();
                    assistantText += choice.delta.content;
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
              const requestFamily = normalizeFamily(
                billingContext?.family as "closed" | "open_weight" | undefined,
                usedProviderSlug
              );
              try {
                const cost = await calculateCost({
                  providerSlug: usedProviderSlug,
                  modelId: body.model,
                  promptTokens,
                  completionTokens,
                  region,
                  plan: (billingContext?.plan || organization.plan || "free") as
                    | "free"
                    | "pro"
                    | "enterprise",
                  family: requestFamily,
                });
                costUsd = cost.totalCost;
              } catch {
                // pricing not configured
              }

              const inserted = await db
                .insert(requests)
                .values({
                apiKeyId: apiKey.id,
                organizationId: organization.id,
                providerId: providerId || usedProviderSlug,
                modelId: body.model,
                requestType: "chat",
                promptTokens,
                completionTokens,
                totalTokens,
                latencyMs: Date.now() - startTime,
                costUsd: costUsd.toString(),
                status: "success",
                region,
                dataClass,
                policyViolationId: policyResult?.violationId || undefined,
                guardrailOutcome: policyResult?.guardrailResults || undefined,
                metadata: {
                  fallbackFrom,
                  providerChain: chainSlugs,
                  originalModel: c.get("originalModel"),
                  policyAction: policyResult?.action,
                  governanceModelId: policyResult?.governance?.id,
                  businessUnit: c.get("businessUnit"),
                  clientId: c.get("clientId"),
                },
                })
                .returning({ id: requests.id });

              if (costUsd > 0) {
                try {
                  await debitUsage(organization.id, costUsd, inserted[0]?.id, {
                    plan: (billingContext?.plan || organization.plan || "free") as
                      | "free"
                      | "pro"
                      | "enterprise",
                    family: requestFamily,
                    providerSlug: usedProviderSlug,
                    useFromPlan: Boolean(billingContext?.useFromPlan),
                    useFromCredits: !billingContext?.useFromPlan,
                  });
                } catch (billingError) {
                  console.error("Failed to debit usage after stream completion:", billingError);
                }
              }

              await recordTokens(apiKey.keyPrefix, totalTokens);

              const latencySec = (Date.now() - startTime) / 1000;
              captureAiGeneration({
                distinctId: organization.id,
                model: body.model,
                providerSlug: usedProviderSlug,
                input: sanitizeMessagesForAi(body.messages),
                outputChoices: assistantChoicesFromText(assistantText),
                inputTokens: promptTokens,
                outputTokens: completionTokens,
                latencySeconds: latencySec,
                stream: true,
                timeToFirstTokenSeconds:
                  firstTokenAt != null
                    ? (firstTokenAt - startTime) / 1000
                    : undefined,
                extra: {
                  organization_id: organization.id,
                  region,
                  request_id: inserted[0]?.id,
                },
              });
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
                dataClass,
                policyViolationId: policyResult?.violationId || undefined,
                guardrailOutcome: policyResult?.guardrailResults || undefined,
                metadata: {
                  fallbackFrom,
                  providerChain: chainSlugs,
                  originalModel: c.get("originalModel"),
                  policyAction: policyResult?.action,
                  businessUnit: c.get("businessUnit"),
                  clientId: c.get("clientId"),
                },
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
        const requestFamily = normalizeFamily(
          billingContext?.family as "closed" | "open_weight" | undefined,
          usedProviderSlug
        );
        try {
          const cost = await calculateCost({
            providerSlug: usedProviderSlug,
            modelId: body.model,
            promptTokens,
            completionTokens,
            region,
            plan: (billingContext?.plan || organization.plan || "free") as
              | "free"
              | "pro"
              | "enterprise",
            family: requestFamily,
          });
          costUsd = cost.totalCost;
        } catch {
          // pricing not configured
        }

        const inserted = await db
          .insert(requests)
          .values({
          apiKeyId: apiKey.id,
          organizationId: organization.id,
          providerId: providerId || usedProviderSlug,
          modelId: body.model,
          requestType: "chat",
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs: Date.now() - startTime,
          costUsd: costUsd.toString(),
          status: "success",
          region,
          dataClass,
          policyViolationId: policyResult?.violationId || undefined,
          guardrailOutcome: policyResult?.guardrailResults || undefined,
          metadata: {
            fallbackFrom,
            providerChain: chainSlugs,
            originalModel: c.get("originalModel"),
            policyAction: policyResult?.action,
            governanceModelId: policyResult?.governance?.id,
            businessUnit: c.get("businessUnit"),
            clientId: c.get("clientId"),
          },
          })
          .returning({ id: requests.id });

        if (costUsd > 0) {
          try {
            await debitUsage(organization.id, costUsd, inserted[0]?.id, {
              plan: (billingContext?.plan || organization.plan || "free") as
                | "free"
                | "pro"
                | "enterprise",
              family: requestFamily,
              providerSlug: usedProviderSlug,
              useFromPlan: Boolean(billingContext?.useFromPlan),
              useFromCredits: !billingContext?.useFromPlan,
            });
          } catch (billingError) {
            console.error("Failed to debit usage after completion:", billingError);
          }
        }

        await recordTokens(apiKey.keyPrefix, totalTokens);

        const latencySec = (Date.now() - startTime) / 1000;
        const outputChoices =
          response.choices?.map((c: any) => ({
            role: c.message?.role,
            content:
              typeof c.message?.content === "string"
                ? c.message.content.slice(0, 8000)
                : JSON.stringify(c.message?.content ?? "").slice(0, 8000),
          })) ?? [];
        captureAiGeneration({
          distinctId: organization.id,
          model: body.model,
          providerSlug: usedProviderSlug,
          input: sanitizeMessagesForAi(body.messages),
          outputChoices,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          latencySeconds: latencySec,
          stream: false,
          extra: {
            organization_id: organization.id,
            region,
            request_id: inserted[0]?.id,
          },
        });

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
    modelId: body.model,
    requestType: "chat",
    status: "error",
    errorMessage: lastError?.message || "All providers failed",
    latencyMs: Date.now() - startTime,
    costUsd: "0",
    region,
    dataClass,
    policyViolationId: policyResult?.violationId || undefined,
    guardrailOutcome: policyResult?.guardrailResults || undefined,
    metadata: {
      providerChain: chainSlugs,
      allFailed: true,
      originalModel: c.get("originalModel"),
      policyAction: policyResult?.action,
      businessUnit: c.get("businessUnit"),
      clientId: c.get("clientId"),
    },
  });

  captureGatewayEvent(organization.id, "gateway_chat_all_providers_failed", {
    model: body.model,
    error: lastError?.message,
    tried_providers: chainSlugs,
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
