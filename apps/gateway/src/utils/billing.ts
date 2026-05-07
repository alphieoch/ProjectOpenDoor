// @ts-nocheck
import Redis from "ioredis";
import { db, organizations, creditTransactions } from "@opendoor/database";
import { eq } from "drizzle-orm";
import type { BillingPlan, ModelFamily } from "./pricing.js";

const redis = new (Redis as any)(process.env.REDIS_URL || "redis://localhost:6379");
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export interface BillingContext {
  plan: BillingPlan;
  family: ModelFamily;
  providerSlug: string;
  useFromPlan: boolean;
  useFromCredits: boolean;
  estimatedCostUsd?: number;
}

function parseEnvInt(name: string, fallback: number): number {
  const value = process.env[name];
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getPlanBudgetLimitCents(plan: BillingPlan): number {
  if (plan === "pro") {
    return parseEnvInt("PLAN_BUDGET_PRO_PER_4H_CENTS", 500);
  }
  if (plan === "enterprise") {
    return parseEnvInt("PLAN_BUDGET_ENTERPRISE_PER_4H_CENTS", 3000);
  }
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
  const usedCents = Number.parseInt((await redis.get(windowKey)) || "0", 10) || 0;

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

  const pipeline = redis.multi();
  pipeline.incrby(key, amountCents);
  pipeline.expire(key, ttlSeconds);
  await pipeline.exec();
}

export async function debitCredits(
  orgId: string,
  amountCents: number,
  requestId?: string
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
    if (currentBalance < amountCents) {
      throw new Error("Insufficient prepaid balance");
    }

    const newBalance = currentBalance - amountCents;
    await tx
      .update(organizations)
      .set({ creditsUsdCents: newBalance })
      .where(eq(organizations.id, orgId));

    await tx.insert(creditTransactions).values({
      organizationId: orgId,
      kind: "usage",
      amountCents: -amountCents,
      balanceAfterCents: newBalance,
      requestId: requestId || null,
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
    await debitCredits(orgId, costCents, requestId);
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
