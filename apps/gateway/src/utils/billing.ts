// @ts-nocheck
import { db, organizations, creditTransactions } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { splitCreditBuckets, welcomeAllowedForFamily } from "@opendoor/shared";
import type { BillingPlan, ModelFamily } from "./pricing.js";
import { createRedis } from "../lib/redis.js";

const redis = createRedis();
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export interface BillingContext {
  plan: BillingPlan;
  family: ModelFamily;
  providerSlug: string;
  useFromPlan: boolean;
  useFromCredits: boolean;
  estimatedCostUsd?: number;
}

export function getPlanBudgetLimitCents(_plan: BillingPlan): number {
  // Included usage is a monthly credit stipend on invoice.payment_succeeded.
  // A rolling 4h window at the old defaults ($5 / $15 / $30) would give
  // Pro ~$900/mo of free inference on a $7 seat.
  return 0;
}

export function usdToCents(usd: number): number {
  return Math.max(0, Math.ceil(usd * 100));
}

export function centsToUsd(cents: number): number {
  return cents / 100;
}

function getCurrentWindowStart(now = Date.now()): number {
  return Math.floor(now / FOUR_HOURS_MS) * FOUR_HOURS_MS;
}

function getWindowResetAt(windowStartMs: number): Date {
  return new Date(windowStartMs + FOUR_HOURS_MS);
}

function getPlanBudgetKey(orgId: string, windowStartMs: number): string {
  return `plan_budget:${orgId}:${windowStartMs}`;
}

export async function getPlanBudgetState(orgId: string, plan: BillingPlan) {
  const limitCents = getPlanBudgetLimitCents(plan);
  const windowStartMs = getCurrentWindowStart();
  const windowKey = getPlanBudgetKey(orgId, windowStartMs);
  let usedCents = 0;
  try {
    usedCents = Number.parseInt((await redis.get(windowKey)) || "0", 10) || 0;
  } catch {
    usedCents = 0;
  }

  return {
    usedCents,
    limitCents,
    remainingCents: Math.max(0, limitCents - usedCents),
    resetsAt: getWindowResetAt(windowStartMs),
  };
}

export async function shouldUsePlanBudget(
  orgId: string,
  plan: BillingPlan,
  estimatedCostCents: number
) {
  const state = await getPlanBudgetState(orgId, plan);
  if (state.limitCents <= 0) return false;
  return state.usedCents + estimatedCostCents <= state.limitCents;
}

export async function debitPlanBudget(
  orgId: string,
  plan: BillingPlan,
  amountCents: number
) {
  const limitCents = getPlanBudgetLimitCents(plan);
  if (limitCents <= 0 || amountCents <= 0) return;

  const windowStartMs = getCurrentWindowStart();
  const key = getPlanBudgetKey(orgId, windowStartMs);
  const ttlSeconds = Math.max(
    60,
    Math.ceil((windowStartMs + FOUR_HOURS_MS - Date.now()) / 1000)
  );

  try {
    const pipeline = redis.multi();
    pipeline.incrby(key, amountCents);
    pipeline.expire(key, ttlSeconds);
    await pipeline.exec();
  } catch {
    /* redis optional */
  }
}

export async function expireWelcomeCredits(org: {
  id: string;
  creditsUsdCents?: number | null;
  welcomeCreditsUsdCents?: number | null;
  welcomeExpiresAt?: Date | string | null;
}) {
  const buckets = splitCreditBuckets(org);
  if (!buckets.expired || buckets.clawbackCents <= 0) return buckets;

  const nextTotal = Math.max(0, buckets.totalCents - buckets.clawbackCents);
  await db
    .update(organizations)
    .set({ creditsUsdCents: nextTotal, welcomeCreditsUsdCents: 0 })
    .where(eq(organizations.id, org.id));
  await db.insert(creditTransactions).values({
    organizationId: org.id,
    kind: "welcome_expire",
    amountCents: -buckets.clawbackCents,
    balanceAfterCents: nextTotal,
    metadata: { source: "welcome_expiry" },
  });
  return splitCreditBuckets({
    creditsUsdCents: nextTotal,
    welcomeCreditsUsdCents: 0,
    welcomeExpiresAt: org.welcomeExpiresAt,
  });
}

export async function debitCredits(
  orgId: string,
  amountCents: number,
  requestId?: string,
  options?: { allowWelcome?: boolean }
) {
  if (amountCents <= 0) return 0;
  const allowWelcome = Boolean(options?.allowWelcome);

  return db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        creditsUsdCents: true,
        welcomeCreditsUsdCents: true,
        welcomeExpiresAt: true,
      },
    });
    if (!org) {
      throw new Error("Organization not found");
    }

    let buckets = splitCreditBuckets(org);
    if (buckets.expired && buckets.clawbackCents > 0) {
      const nextTotal = Math.max(0, buckets.totalCents - buckets.clawbackCents);
      await tx
        .update(organizations)
        .set({ creditsUsdCents: nextTotal, welcomeCreditsUsdCents: 0 })
        .where(eq(organizations.id, orgId));
      await tx.insert(creditTransactions).values({
        organizationId: orgId,
        kind: "welcome_expire",
        amountCents: -buckets.clawbackCents,
        balanceAfterCents: nextTotal,
        metadata: { source: "welcome_expiry" },
      });
      buckets = splitCreditBuckets({
        creditsUsdCents: nextTotal,
        welcomeCreditsUsdCents: 0,
        welcomeExpiresAt: org.welcomeExpiresAt,
      });
    }

    const spendable = allowWelcome ? buckets.totalCents : buckets.paidCents;
    if (spendable < amountCents) {
      throw new Error(
        allowWelcome
          ? "Insufficient prepaid balance"
          : "Welcome credit cannot cover this charge. Add prepaid credit."
      );
    }

    const fromWelcome = allowWelcome
      ? Math.min(buckets.welcomeCents, amountCents)
      : 0;
    const newBalance = buckets.totalCents - amountCents;
    const newWelcome = buckets.welcomeCents - fromWelcome;

    await tx
      .update(organizations)
      .set({
        creditsUsdCents: newBalance,
        welcomeCreditsUsdCents: newWelcome,
      })
      .where(eq(organizations.id, orgId));

    await tx.insert(creditTransactions).values({
      organizationId: orgId,
      kind: "usage",
      amountCents: -amountCents,
      balanceAfterCents: newBalance,
      requestId: requestId || null,
      metadata: {
        from_welcome_cents: fromWelcome,
        from_paid_cents: amountCents - fromWelcome,
      },
    });

    return newBalance;
  });
}

export async function creditRefund(
  orgId: string,
  amountCents: number,
  requestId?: string,
  metadata?: Record<string, unknown>
) {
  if (amountCents <= 0) return 0;

  return db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { creditsUsdCents: true },
    });
    if (!org) {
      throw new Error("Organization not found");
    }

    const currentBalance = Number(org.creditsUsdCents || 0);
    const newBalance = currentBalance + amountCents;

    await tx
      .update(organizations)
      .set({ creditsUsdCents: newBalance })
      .where(eq(organizations.id, orgId));

    await tx.insert(creditTransactions).values({
      organizationId: orgId,
      kind: "refund",
      amountCents,
      balanceAfterCents: newBalance,
      requestId: requestId || null,
      metadata: metadata || null,
    });

    return newBalance;
  });
}

export async function debitUsage(
  orgId: string,
  costUsd: number,
  requestId: string | undefined,
  billingContext: BillingContext
) {
  const costCents = usdToCents(costUsd);
  if (costCents <= 0) return;

  if (billingContext.useFromPlan) {
    await debitPlanBudget(orgId, billingContext.plan, costCents);
    return;
  }

  if (billingContext.useFromCredits) {
    await debitCredits(orgId, costCents, requestId, {
      allowWelcome: welcomeAllowedForFamily(billingContext.family),
    });
  }
}

// ── Auto-recharge trigger ────────────────────────────────────────────────────

let _stripe: any = null;

function getStripe(): any {
  if (_stripe) return _stripe;
  const Stripe = require("stripe");
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" });
  return _stripe;
}

export async function triggerAutoRecharge(orgId: string): Promise<void> {
  try {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        creditsUsdCents: true,
        autoRechargeEnabled: true,
        autoRechargeThresholdCents: true,
        autoRechargeAmountCents: true,
        defaultPaymentMethodId: true,
        stripeCustomerId: true,
      },
    });
    if (!org) return;

    if (!org.autoRechargeEnabled) return;
    if (!org.autoRechargeAmountCents || org.autoRechargeAmountCents <= 0) return;
    if (!org.autoRechargeThresholdCents || org.autoRechargeThresholdCents <= 0) return;

    const balance = Number(org.creditsUsdCents || 0);
    if (balance >= org.autoRechargeThresholdCents) return;

    const stripe = getStripe();
    if (!stripe) {
      console.warn("Auto-recharge skipped: STRIPE_SECRET_KEY not configured");
      return;
    }
    if (!org.stripeCustomerId) {
      console.warn("Auto-recharge skipped: no Stripe customer for org", orgId);
      return;
    }

    // Use default payment method if available; otherwise Stripe will use customer's default
    const paymentMethod = org.defaultPaymentMethodId || undefined;

    await stripe.paymentIntents.create({
      amount: org.autoRechargeAmountCents,
      currency: "usd",
      customer: org.stripeCustomerId,
      payment_method: paymentMethod,
      off_session: true,
      confirm: true,
      metadata: {
        kind: "auto_recharge",
        organizationId: orgId,
        amountCents: String(org.autoRechargeAmountCents),
      },
    });
  } catch (err: any) {
    console.error("Auto-recharge trigger failed:", err.message);
  }
}
