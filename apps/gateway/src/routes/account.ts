import { Hono } from "hono";
import { getPlan, splitCreditBuckets } from "@opendoor/shared";
import { requireTenant } from "../lib/platform.js";

const accountRouter = new Hono();

accountRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const { organization, apiKey } = tenant;
  const plan = getPlan(organization.plan);
  const buckets = splitCreditBuckets(organization);
  return c.json({
    object: "account",
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      plan_name: plan.name,
      sector: organization.sector,
      data_residency: organization.dataResidency,
    },
    billing: {
      credits_usd_cents: buckets.totalCents,
      paid_credits_usd_cents: buckets.paidCents,
      welcome_credits_usd_cents: buckets.welcomeCents,
      welcome_expires_at: buckets.expiresAt,
      subscription_status: organization.subscriptionStatus,
      agents_addon: organization.agentsAddonStatus,
      web_search_addon: organization.webSearchAddonStatus,
    },
    limits: {
      max_api_keys: plan.maxApiKeys,
      max_active_deployments: plan.maxActiveDeployments,
      included_credits_cents: plan.includedCreditsCents,
    },
    key: {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.keyPrefix,
      spend_limit_usd_cents: apiKey.spendLimitUsdCents,
      spend_used_usd_cents: apiKey.spendUsedUsdCents,
      allowed_models: apiKey.allowedModels,
      last_used_at: apiKey.lastUsedAt,
    },
  });
});

accountRouter.get("/balance", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const buckets = splitCreditBuckets(tenant.organization);
  return c.json({
    object: "balance",
    credits_usd_cents: buckets.totalCents,
    paid_credits_usd_cents: buckets.paidCents,
    welcome_credits_usd_cents: buckets.welcomeCents,
    spendable_open_weight_usd_cents: buckets.paidCents + buckets.welcomeCents,
    spendable_closed_usd_cents: buckets.paidCents,
    welcome_expires_at: buckets.expiresAt,
    key_spend_used_usd_cents: tenant.apiKey.spendUsedUsdCents,
    key_spend_limit_usd_cents: tenant.apiKey.spendLimitUsdCents,
  });
});

export default accountRouter;
