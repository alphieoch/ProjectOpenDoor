// @ts-nocheck
import type { Context, Next } from "hono";
import { db } from "@opendoor/database";
import { apiKeys, organizations, models, providers } from "@opendoor/database";
import { eq, and, isNull } from "drizzle-orm";
import { createHash } from "crypto";
import { estimateTokens } from "../utils/streaming.js";
import { calculateCost } from "../utils/pricing.js";
import { shouldUsePlanBudget, usdToCents } from "../utils/billing.js";

function normalizePlan(plan: string): "free" | "pro" | "enterprise" {
  if (plan === "pro" || plan === "enterprise") return plan;
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
    model.startsWith("custom:") ||
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

  const prefix = apiKey.slice(0, 16);
  const hash = createHash("sha256").update(apiKey).digest("hex");

  const keyRecord = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.keyPrefix, prefix),
      eq(apiKeys.keyHash, hash),
      isNull(apiKeys.revokedAt)
    ),
  });

  if (!keyRecord) {
    return c.json({ error: "Invalid API key" }, 401);
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

  if (c.req.method === "POST" && c.req.path.endsWith("/chat/completions")) {
    try {
      const body = await c.req.json();
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

        const promptTokens = body.messages.reduce((sum: number, m: any) => {
          const content =
            typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "");
          return sum + estimateTokens(content);
        }, 0);
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
          const credits = Number(org.creditsUsdCents || 0);
          const canUseCredits = credits >= estimatedCostCents;

          if (!canUsePlan && !canUseCredits) {
            const topupUrl = `${
              process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
            }/dashboard/billing`;
            return c.json(
              {
                error: "Insufficient balance",
                detail:
                  "Your current 4-hour plan allowance and prepaid credits cannot cover this request estimate.",
                estimatedCostUsd: estimatedCost.totalCost,
                creditsUsdCents: credits,
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

  await next();
}
