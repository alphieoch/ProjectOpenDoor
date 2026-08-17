// @ts-nocheck
import { Hono } from "hono";
import { db, requests, providers, models, apiKeys } from "@opendoor/database";
import type { ChatCompletionRequest } from "@opendoor/shared";
import {
  flattenMessageText,
  spendableCents,
  splitCreditBuckets,
  welcomeAllowedForFamily,
} from "@opendoor/shared";
import { resolveProvider, instantiateProvider } from "../providers/index.js";
import {
  hasVertexPlatform,
  isLegacyTogetherServerlessId,
  isProductionRuntime,
  shouldAdvertiseServerlessTogether,
  shouldAdvertiseServerlessWholesale,
} from "@opendoor/shared";
import { alwaysUseSlugs, loadOrgProviderKeys, touchOrgProviderKeyUsed } from "../lib/byok.js";
import { applyProviderRouting } from "../lib/provider-routing.js";
import { randomUUID } from "crypto";
import { calculateCost } from "../utils/pricing.js";
import { encodeSSE, encodeSSEDone } from "../utils/streaming.js";
import { recordTokens } from "../middleware/rate-limit.js";
import { estimateTokens } from "../utils/streaming.js";
import { debitUsage, shouldUsePlanBudget, usdToCents, triggerAutoRecharge } from "../utils/billing.js";
import { eq, and, sql } from "drizzle-orm";
import {
  assistantChoicesFromText,
  captureAiGeneration,
  captureGatewayEvent,
  sanitizeMessagesForAi,
} from "../lib/posthog.js";
import { recordSuccess, recordError } from "../lib/health-tracker.js";
import { getRankedProviders } from "../lib/smart-router.js";
import {
  applyAffinityToChain,
  lookupCacheAffinity,
  promptCacheFingerprint,
  rememberCacheAffinity,
} from "../lib/prompt-cache.js";
import { normalizeServiceTier } from "../lib/service-tier.js";
import { applyModelRouting, isModelAllowed } from "../lib/model-aliases.js";
import { applyMessageTransforms } from "../lib/transforms.js";

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

function isAbortOrTimeout(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    /aborted|timeout|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/i.test(message)
  );
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
      if (isAbortOrTimeout(err) || attempt >= 2) {
        return { error: err instanceof Error ? err : new Error(String(err)) };
      }
      await sleep(100 * Math.pow(2, attempt));
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

  const requestedModel = body.model;
  await applyModelRouting(body, {
    allowedModels: apiKey.allowedModels as string[] | null,
  });

  if (!body.model) {
    return c.json({ error: "Model is required" }, 400);
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return c.json({ error: "Messages are required" }, 400);
  }

  // Check model permissions
  const allowedModels = apiKey.allowedModels as string[] | null;
  if (allowedModels && allowedModels.length > 0) {
    if (!isModelAllowed(body.model, allowedModels) && !isModelAllowed(requestedModel, allowedModels)) {
      return c.json(
        {
          error: `Model '${body.model}' is not allowed for this API key. Allowed models: ${allowedModels.join(", ")}`,
        },
        403
      );
    }
  }

  // Catalog status: live = callable; warming/dedicated = listed but not served yet.
  // Do not block open-weight models with Azure-era "available_on_request".
  const modelRows = await db
    .select({
      deploymentStatus: models.deploymentStatus,
      displayName: models.displayName,
      family: models.family,
      contextWindow: models.contextWindow,
    })
    .from(models)
    .where(eq(models.modelId, body.model))
    .limit(1);

  const modelStatus = modelRows[0]?.deploymentStatus || null;
  const isOpenWeight =
    modelRows[0]?.family === "open_weight" ||
    body.model.startsWith("custom:") ||
    body.model.startsWith("premium:") ||
    body.model.startsWith("ollama:") ||
    body.model.includes("llama") ||
    body.model.includes("qwen") ||
    body.model.includes("deepseek") ||
    body.model.includes("mistral") ||
    body.model.includes("gemma");

  if (modelStatus === "warming") {
    return c.json(
      {
        error: `Model '${body.model}' is warming`,
        message: `'${modelRows[0]?.displayName || body.model}' is in the catalog and will be callable shortly. Request a GPU deployment or check back soon.`,
        status: "warming",
        model: body.model,
      },
      503
    );
  }

  if (modelStatus === "dedicated") {
    return c.json(
      {
        error: `Model '${body.model}' needs a dedicated GPU`,
        message: `Deploy '${modelRows[0]?.displayName || body.model}' from Dashboard → Deployments (this Mac or GCP), then call custom:<deploymentId>.`,
        status: "dedicated",
        model: body.model,
      },
      400
    );
  }

  // Legacy Azure gate only for closed models still marked available_on_request
  if (modelStatus === "available_on_request" && !isOpenWeight) {
    return c.json(
      {
        error: `Model '${body.model}' is available upon request`,
        message: `This closed model is not currently deployed. Contact your administrator to enable '${modelRows[0]?.displayName || body.model}'`,
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
        message: `'${modelRows[0]?.displayName || body.model}' will be available shortly.`,
        status: "coming_soon",
        model: body.model,
      },
      400
    );
  }

  body.messages = applyMessageTransforms(body.messages, {
    transforms: body.transforms,
    contextWindow: modelRows[0]?.contextWindow,
    maxTokens: typeof body.max_tokens === "number" && body.max_tokens > 0 ? body.max_tokens : 1024,
  });

  const byokKeys = await loadOrgProviderKeys(organization.id);
  const hasTogetherByok = byokKeys.has("together");
  const hasVertexByok = byokKeys.has("vertex");
  const wholesaleConfigured = shouldAdvertiseServerlessWholesale({
    hasOrgByok: hasTogetherByok || hasVertexByok,
  });

  const resolved = await resolveProvider(body.model, {
    byokSlugs: [...byokKeys.keys()],
    organizationId: organization.id,
  });
  if (!resolved) {
    if (isProductionRuntime() && isLegacyTogetherServerlessId(body.model) && !wholesaleConfigured) {
      return c.json(
        {
          error: "Serverless wholesale path is not configured",
          message:
            "Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID with Application Default Credentials (Vertex Model Garden), or TOGETHER_API_KEY / org BYOK for Together overflow.",
          status: "wholesale_not_configured",
          model: body.model,
        },
        503
      );
    }
    const hint = isLegacyTogetherServerlessId(body.model)
      ? "This id is not on Vertex MaaS. Call gemma-4-26b-a4b-it, qwen3-next-80b-instruct, or deepseek-v3.2, or use Ollama / Together overflow."
      : body.model.startsWith("deepseek")
        ? "DeepSeek is not configured. Set DEEPSEEK_API_KEY, or pick a local Ollama model such as llama3.2:3b."
        : "This model is not routed on the gateway. Pick a local model or configure the provider API key.";
    return c.json({ error: `Model not found: ${body.model}. ${hint}` }, 404);
  }

  if (
    resolved.provider.slug === "together" &&
    !shouldAdvertiseServerlessTogether({ hasOrgByok: hasTogetherByok })
  ) {
    return c.json(
      {
        error: "Serverless wholesale path is not configured",
        message:
          "Together overflow is not configured. Use a Vertex MaaS id (gemma-4-26b-a4b-it, qwen3-next-80b-instruct, deepseek-v3.2), set TOGETHER_API_KEY, or add org BYOK for 'together'.",
        status: "wholesale_not_configured",
        model: body.model,
      },
      503
    );
  }

  if (
    resolved.provider.slug === "vertex" &&
    isProductionRuntime() &&
    !hasVertexPlatform() &&
    !hasVertexByok
  ) {
    return c.json(
      {
        error: "Serverless wholesale path is not configured",
        message:
          "Vertex is not configured. Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials, or VERTEX_API_KEY.",
        status: "wholesale_not_configured",
        model: body.model,
      },
      503
    );
  }

  // Pre-authorize affordability before provider execution.
  if (!c.get("skipBilling")) try {
    const promptTokensEstimate = body.messages.reduce((sum, m) => {
      return sum + estimateTokens(flattenMessageText(m?.content));
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
    const buckets = splitCreditBuckets(organization);
    const credits = spendableCents(
      buckets,
      welcomeAllowedForFamily(requestFamily)
    );

    if (!canUsePlan && credits < estimatedCostCents) {
      return c.json(
        {
          error: "Insufficient balance",
          detail: welcomeAllowedForFamily(requestFamily)
            ? "Prepaid credits cannot cover this request estimate."
            : "Welcome credit is for open-weight models only. Add prepaid credit to use this model.",
          estimatedCostUsd: estimatedCost.totalCost,
          creditsUsdCents: buckets.totalCents,
          paidCreditsUsdCents: buckets.paidCents,
          welcomeCreditsUsdCents: buckets.welcomeCents,
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

  // Compute token estimates for routing
  const promptTokensEstimate = body.messages.reduce((sum, m) => {
    return sum + estimateTokens(flattenMessageText(m?.content));
  }, 0);
  const completionEstimate =
    typeof body.max_tokens === "number" && body.max_tokens > 0 ? body.max_tokens : 1024;
  const requestFamily = normalizeFamily(
    billingContext?.family as "closed" | "open_weight" | undefined,
    resolved.provider.slug
  );

  // House chat skips Redis-backed ranking — go straight to the resolved provider.
  const houseChat = Boolean(c.get("skipBilling"));
  const ranked = houseChat
    ? [
        {
          slug: resolved.provider.slug,
          score: 0,
          health: {
            slug: resolved.provider.slug,
            successRate: 1,
            avgLatencyMs: 0,
            successCount: 0,
            errorCount: 0,
            totalCalls: 0,
            lastSeenAt: null,
          },
          estimatedCostUsd: 0,
          canServe: true,
        },
      ]
    : await getRankedProviders(body.model, {
        promptTokens: promptTokensEstimate,
        completionTokens: completionEstimate,
        plan: (billingContext?.plan || organization.plan || "free") as
          | "free"
          | "pro"
          | "team"
          | "enterprise",
        family: requestFamily,
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

  // Prompt-cache session affinity + sticky cache key for wholesale providers
  const cacheFp = promptCacheFingerprint(body.model, body.messages, body.user);
  if (!body.prompt_cache_key) {
    body.prompt_cache_key = `opd_${organization.id.slice(0, 8)}_${cacheFp}`;
  }
  const sticky = houseChat
    ? null
    : await lookupCacheAffinity({
        organizationId: organization.id,
        model: body.model,
        fingerprint: cacheFp,
      });
  chainSlugs = applyAffinityToChain(chainSlugs, sticky);

  const serviceTier = normalizeServiceTier(
    body.service_tier ?? c.get("serviceTier")
  );
  body.service_tier = serviceTier;

  // Enforce data residency: filter providers by org dataResidency and model governance allowedRegions
  const allowedRegions = new Set<string>();
  if (organization.dataResidency) {
    allowedRegions.add(organization.dataResidency);
  }
  if (policyResult?.governance?.allowedRegions) {
    for (const r of policyResult.governance.allowedRegions) {
      allowedRegions.add(r);
    }
  }
  if (allowedRegions.size > 0) {
    const providerRows = await db
      .select({ slug: providers.slug, region: providers.region })
      .from(providers)
      .where(eq(providers.enabled, true));
    const regionMap = new Map(providerRows.map((p) => [p.slug, p.region]));
    const filteredChain = chainSlugs.filter((slug) => {
      const region = regionMap.get(slug);
      // If provider has no region declared, allow it (backward compatible)
      if (!region) return true;
      return allowedRegions.has(region);
    });
    if (filteredChain.length === 0) {
      return c.json(
        {
          error: "Data residency constraint violated",
          detail: `No providers in the fallback chain match the required regions: ${Array.from(allowedRegions).join(", ")}`,
          requestedRegions: Array.from(allowedRegions),
          triedChain: chainSlugs,
        },
        403
      );
    }
    chainSlugs = filteredChain;
  }

  let providerId: string | null = null;
  let lastError: Error | null = null;
  let usedProviderSlug = chainSlugs[0] || resolved.provider.slug;
  let fallbackFrom: string | null = null;

  // Try each provider in the chain
  for (let chainIndex = 0; chainIndex < chainSlugs.length; chainIndex++) {
    const slug = chainSlugs[chainIndex];
    const byok = byokKeys.get(slug);
    const provider = instantiateProvider(slug, byok?.plaintext);
    if (!provider) continue;
    if (byok) touchOrgProviderKeyUsed(byok.id);

    // Lookup provider UUID for FK constraint
    try {
      const providerRows = await db
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.slug as any, slug))
        .limit(1);
      providerId = providerRows[0]?.id || null;
    } catch {
      providerId = slug;
    }

    usedProviderSlug = slug;
    if (chainIndex > 0) {
      fallbackFrom = chainSlugs[0];
    }

    const providerStartTime = Date.now();
    const result = await tryProvider(provider, resolved.model, body, !!body.stream);

    if (result.error) {
      await recordError(slug, result.error);
      lastError = result.error;
      continue;
    }

    // Provider responded successfully (time-to-first-response)
    await recordSuccess(slug, Date.now() - providerStartTime);
    await rememberCacheAffinity({
      organizationId: organization.id,
      model: body.model,
      fingerprint: cacheFp,
      providerSlug: slug,
    });

    // Success — handle streaming or non-streaming
    try {
      if (body.stream && result.streamGenerator) {
        const generationId = randomUUID();
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");
        c.header("x-generation-id", generationId);

        const stream = new ReadableStream({
          async start(controller) {
            let promptTokens = 0;
            let completionTokens = 0;
            let assistantText = "";
            let firstTokenAt: number | null = null;

            try {
              // Estimate prompt tokens
              promptTokens = body.messages.reduce(
                (sum, m) => sum + estimateTokens(flattenMessageText(m.content)),
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
                  cachedTokens: 0,
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
                id: generationId,
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
                  serviceTier,
                  promptCacheKey: body.prompt_cache_key,
                  cachedTokens: 0,
                  streamed: true,
                  ...(c.get("appAttribution") || {}),
                },
                })
                .returning({ id: requests.id });

              if (costUsd > 0 && !c.get("skipBilling")) {
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
                  // Update per-key spend tracking
                  const costCents = usdToCents(costUsd);
                  if (costCents > 0) {
                    await db
                      .update(apiKeys)
                      .set({ spendUsedUsdCents: sql`${apiKeys.spendUsedUsdCents} + ${costCents}` })
                      .where(eq(apiKeys.id, apiKey.id));
                  }
                  // Trigger auto-recharge if applicable
                  if (!billingContext?.useFromPlan) {
                    triggerAutoRecharge(organization.id).catch(() => {});
                  }
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

              await recordError(slug, error);

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
                  ...(c.get("appAttribution") || {}),
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
        const cachedTokens = Number(response.usage?.cached_tokens || 0);

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
            cachedTokens,
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

        const generationId = randomUUID();
        const inserted = await db
          .insert(requests)
          .values({
          id: generationId,
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
            serviceTier,
            promptCacheKey: body.prompt_cache_key,
            cachedTokens,
            ...(c.get("appAttribution") || {}),
          },
          })
          .returning({ id: requests.id });

        if (costUsd > 0 && !c.get("skipBilling")) {
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
            // Update per-key spend tracking
            const costCents = usdToCents(costUsd);
            if (costCents > 0) {
              await db
                .update(apiKeys)
                .set({ spendUsedUsdCents: sql`${apiKeys.spendUsedUsdCents} + ${costCents}` })
                .where(eq(apiKeys.id, apiKey.id));
            }
            // Trigger auto-recharge if applicable
            if (!billingContext?.useFromPlan) {
              triggerAutoRecharge(organization.id).catch(() => {});
            }
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

        c.header("x-generation-id", generationId);
        response.id = generationId;
        return c.json(response);
      }
    } catch (error: any) {
      await recordError(slug, error);
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
      ...(c.get("appAttribution") || {}),
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
