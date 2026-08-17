// @ts-nocheck
import type { Context, Next } from "hono";
import { db } from "@opendoor/database";
import { apiKeys, organizations, models, providers } from "@opendoor/database";
import { eq, and, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import {
  flattenMessageText,
  spendableCents,
  welcomeAllowedForFamily,
  SYSTEM_ASSISTANT_KEY_NAME,
} from "@opendoor/shared";
import { estimateTokens } from "../utils/streaming.js";
import { calculateCost } from "../utils/pricing.js";
import { expireWelcomeCredits, shouldUsePlanBudget, usdToCents } from "../utils/billing.js";
import { applyModelRouting, normalizeAllowlist } from "../lib/model-aliases.js";

function internalGatewaySecret() {
  return process.env.INTERNAL_API_KEY || process.env.GATEWAY_INTERNAL_KEY || "";
}

function isInternalGatewayKey(apiKey: string) {
  const secret = internalGatewaySecret();
  return Boolean(secret) && apiKey === secret;
}

async function ensureSystemAssistantKey(orgId: string) {
  const existing = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.organizationId, orgId),
      eq(apiKeys.name, SYSTEM_ASSISTANT_KEY_NAME),
      isNull(apiKeys.revokedAt)
    ),
  });
  if (existing) return existing;

  const compact = orgId.replace(/-/g, "");
  const prefix = `opd_s${compact.slice(0, 11)}`;
  const byPrefix = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyPrefix, prefix),
  });
  if (byPrefix && byPrefix.organizationId === orgId && !byPrefix.revokedAt) {
    return byPrefix;
  }

  const rawKey = `opd_${randomBytes(32).toString("hex")}`;
  const hash = createHash("sha256").update(rawKey).digest("hex");
  try {
    const [created] = await db
      .insert(apiKeys)
      .values({
        name: SYSTEM_ASSISTANT_KEY_NAME,
        keyHash: hash,
        keyPrefix: prefix,
        organizationId: orgId,
      })
      .returning();
    return created;
  } catch {
    const raced = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.organizationId, orgId),
        eq(apiKeys.name, SYSTEM_ASSISTANT_KEY_NAME),
        isNull(apiKeys.revokedAt)
      ),
    });
    if (raced) return raced;
    throw new Error("Failed to create assistant billing key");
  }
}

function normalizePlan(plan: string): "free" | "pro" | "team" | "enterprise" {
  if (plan === "pro" || plan === "team" || plan === "enterprise") return plan;
  return "free";
}

function inferFamilyFromModel(modelId: string, providerSlug?: string): "closed" | "open_weight" {
  const model = modelId.toLowerCase();
  const provider = (providerSlug || "").toLowerCase();
  if (
    provider === "deepseek" ||
    provider === "qwen" ||
    provider === "mistral" ||
    provider === "custom" ||
    provider === "ollama" ||
    model.startsWith("custom:") ||
    model.startsWith("premium:") ||
    model.startsWith("ollama:") ||
    model.includes("llama") ||
    model.includes("deepseek") ||
    model.includes("qwen") ||
    model.includes("mistral")
  ) {
    return "open_weight";
  }
  return "closed";
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const apiKey = authHeader.slice(7);

  if (apiKey.length < 20) {
    return c.json({ error: "Invalid API key format" }, 401);
  }

  const houseChat =
    isInternalGatewayKey(apiKey) && c.req.header("X-OpenDoor-House-Chat") === "1";
  if (houseChat) c.set("skipBilling", true);

  let keyRecord;

  if (isInternalGatewayKey(apiKey)) {
    const orgId = c.req.header("X-OpenDoor-Organization-Id") || "";
    if (!orgId) {
      return c.json(
        { error: "Internal gateway calls must include X-OpenDoor-Organization-Id" },
        401
      );
    }
    const orgForInternal = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!orgForInternal) {
      return c.json({ error: "Organization not found" }, 401);
    }
    keyRecord = await ensureSystemAssistantKey(orgId);
    if (!keyRecord) {
      return c.json({ error: "Failed to bind assistant billing key" }, 500);
    }
  } else {
    const prefix = apiKey.slice(0, 16);
    const hash = createHash("sha256").update(apiKey).digest("hex");

    keyRecord = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.keyPrefix, prefix),
        eq(apiKeys.keyHash, hash),
        isNull(apiKeys.revokedAt)
      ),
    });

    if (!keyRecord) {
      return c.json({ error: "Invalid API key" }, 401);
    }
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id));

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, keyRecord.organizationId),
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 401);
  }

  const plan = normalizePlan(org.plan);
  c.set("billingContext", {
    plan,
    family: "closed",
    providerSlug: "unknown",
    useFromPlan: false,
    useFromCredits: true,
    estimatedCostUsd: 0,
  });

  if (c.req.method === "POST" && c.req.path.endsWith("/chat/completions") && !c.get("skipBilling")) {
    try {
      const body = await c.req.json();
      await applyModelRouting(body, {
        allowedModels: normalizeAllowlist(keyRecord.allowedModels),
      });
      c.set("chatRequestBody", body);

      const modelId = body?.model;
      if (typeof modelId === "string" && Array.isArray(body?.messages)) {
        const modelRow = await db
          .select({
            family: models.family,
            providerSlug: providers.slug,
          })
          .from(models)
          .leftJoin(providers, eq(models.providerId, providers.id))
          .where(eq(models.modelId, modelId))
          .limit(1);

        const providerSlug = modelRow[0]?.providerSlug || "unknown";
        const family =
          (modelRow[0]?.family as "closed" | "open_weight" | undefined) ||
          inferFamilyFromModel(modelId, providerSlug);

        const promptTokens =
          Array.isArray(body.messages) && body.messages.length > 0
            ? body.messages.reduce(
                (sum: number, m: any) =>
                  sum + estimateTokens(flattenMessageText(m?.content)),
                0
              )
            : estimateTokens(flattenMessageText(body.prompt));
        const estimatedCompletionTokens =
          typeof body.max_tokens === "number" && body.max_tokens > 0
            ? body.max_tokens
            : 1024;

        try {
          const estimatedCost = await calculateCost({
            providerSlug,
            modelId,
            promptTokens,
            completionTokens: estimatedCompletionTokens,
            region: process.env.AZURE_REGION || "global",
            plan,
            family,
          });

          const estimatedCostCents = usdToCents(estimatedCost.totalCost);
          const canUsePlan = await shouldUsePlanBudget(org.id, plan, estimatedCostCents);
          const buckets = await expireWelcomeCredits(org);
          const allowWelcome = welcomeAllowedForFamily(family);
          const credits = spendableCents(buckets, allowWelcome);
          const canUseCredits = credits >= estimatedCostCents;

          // Check per-key spend cap
          const keySpendLimit = Number(keyRecord.spendLimitUsdCents || 0);
          const keySpendUsed = Number(keyRecord.spendUsedUsdCents || 0);
          if (keySpendLimit > 0 && keySpendUsed + estimatedCostCents > keySpendLimit) {
            return c.json(
              {
                error: "API key spend limit exceeded",
                detail: `This key has a spend cap of ${(keySpendLimit / 100).toFixed(2)} USD. ` +
                        `Used: ${(keySpendUsed / 100).toFixed(2)} USD. ` +
                        `Estimated request cost: ${(estimatedCostCents / 100).toFixed(2)} USD.`,
                keySpendLimitUsdCents: keySpendLimit,
                keySpendUsedUsdCents: keySpendUsed,
                estimatedCostUsd: estimatedCost.totalCost,
              },
              402
            );
          }

          if (!canUsePlan && !canUseCredits) {
            const topupUrl = `${
              process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
            }/dashboard/billing`;
            const welcomeBlocked =
              !allowWelcome && buckets.welcomeCents > 0 && buckets.paidCents < estimatedCostCents;
            return c.json(
              {
                error: "Insufficient balance",
                detail: welcomeBlocked
                  ? "Welcome credit is for open-weight models only. Add prepaid credit or upgrade to use closed models."
                  : "Prepaid credits cannot cover this request. Add credit on the billing page. Paid plans include a monthly stipend; tokens after that and GPU-seconds are pay-as-you-go.",
                estimatedCostUsd: estimatedCost.totalCost,
                creditsUsdCents: buckets.totalCents,
                paidCreditsUsdCents: buckets.paidCents,
                welcomeCreditsUsdCents: buckets.welcomeCents,
                topupUrl,
              },
              402
            );
          }

          c.set("billingContext", {
            plan,
            family,
            providerSlug,
            useFromPlan: canUsePlan,
            useFromCredits: !canUsePlan,
            estimatedCostUsd: estimatedCost.totalCost,
          });
        } catch {
          // Pricing may be missing for new models; fallback to allowing request.
          c.set("billingContext", {
            plan,
            family,
            providerSlug,
            useFromPlan: false,
            useFromCredits: true,
            estimatedCostUsd: 0,
          });
        }
      }
    } catch {
      // If body parsing fails, route-level validation will return a 400.
    }
  }

  c.set("apiKey", keyRecord);
  c.set("organization", org);
  const httpReferer = c.req.header("HTTP-Referer") || c.req.header("Referer");
  const xTitle = c.req.header("X-Title");
  if (httpReferer || xTitle) {
    c.set("appAttribution", {
      ...(httpReferer ? { httpReferer } : {}),
      ...(xTitle ? { xTitle } : {}),
    });
  }

  await next();
}
