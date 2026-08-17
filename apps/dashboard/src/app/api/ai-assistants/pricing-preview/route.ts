import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { pricingRules } from "@opendoor/database";
import { eq, and, lte, isNull } from "drizzle-orm";

const PLATFORM_FEE_PERCENT = 15; // 15%
const STRIPE_PERCENT = 0.015; // 1.5%
const STRIPE_FIXED_PENCE = 20; // £0.20

/* Rough estimate: ~600 input tokens (system prompt + context + user) + ~400 output tokens per message */
const EST_INPUT_TOKENS_PER_MSG = 600;
const EST_OUTPUT_TOKENS_PER_MSG = 400;
const GBP_PER_USD = 0.79; // approximate GBP/USD rate for cost display

async function getModelPricing(modelId: string) {
  const db = getDb();
  const now = new Date();
  const [rule] = await db
    .select({
      finalInputCostPer1K: pricingRules.finalInputCostPer1K,
      finalOutputCostPer1K: pricingRules.finalOutputCostPer1K,
    })
    .from(pricingRules)
    .where(
      and(
        eq(pricingRules.modelId, modelId),
        lte(pricingRules.effectiveFrom, now),
        isNull(pricingRules.effectiveTo)
      )
    )
    .limit(1);

  if (rule) {
    return {
      inputCostPer1K: Number(rule.finalInputCostPer1K),
      outputCostPer1K: Number(rule.finalOutputCostPer1K),
    };
  }

  return null;
}

function estimateAiCostCents(modelId: string, maxMessages: number, pricing: { inputCostPer1K: number; outputCostPer1K: number } | null): number {
  if (!pricing || maxMessages <= 0) return 0;

  const inputCostUsd = (EST_INPUT_TOKENS_PER_MSG / 1000) * pricing.inputCostPer1K * maxMessages;
  const outputCostUsd = (EST_OUTPUT_TOKENS_PER_MSG / 1000) * pricing.outputCostPer1K * maxMessages;
  const totalCostUsd = inputCostUsd + outputCostUsd;

  // Convert USD to GBP pence (cents)
  return Math.round(totalCostUsd * GBP_PER_USD * 100);
}

function calculatePricing(earningsCents: number, aiCostCents: number) {
  const platformFeeCents = Math.round(earningsCents * (PLATFORM_FEE_PERCENT / 100));
  const subtotal = earningsCents + platformFeeCents + aiCostCents;

  // Solve: total = subtotal + stripe_percent * total + stripe_fixed
  const buyerTotalCents = Math.round((subtotal + STRIPE_FIXED_PENCE) / (1 - STRIPE_PERCENT));
  const stripeFeeCents = Math.round(STRIPE_PERCENT * buyerTotalCents + STRIPE_FIXED_PENCE);

  // Absorb rounding error into stripe fee
  const check = earningsCents + platformFeeCents + aiCostCents + stripeFeeCents;
  const diff = buyerTotalCents - check;

  const profitCents = earningsCents - aiCostCents;

  return {
    earningsCents,
    aiCostCents,
    platformFeeCents,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    stripeFeeCents: stripeFeeCents + diff,
    stripeFeeRate: "1.5% + £0.20",
    buyerTotalCents,
    profitCents,
  };
}

export async function POST(req: NextRequest) {
  await requireAuth();

  let body: { earningsCents?: number; modelId?: string; maxMessages?: number; usageMode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const earningsCents = typeof body.earningsCents === "number" ? body.earningsCents : 0;
  const modelId = body.modelId || "";
  const maxMessages = typeof body.maxMessages === "number" ? body.maxMessages : 100;
  const usageMode = body.usageMode || "included";

  if (earningsCents < 0) {
    return NextResponse.json({ error: "Earnings must be non-negative" }, { status: 400 });
  }

  const pricing = await getModelPricing(modelId);
  // For metered mode, estimate cost for the base allowance only
  // The seller earnings cover the base; overage is extra revenue
  const aiCostCents = estimateAiCostCents(modelId, maxMessages, pricing);
  const result = calculatePricing(earningsCents, aiCostCents);

  return NextResponse.json({ ...result, usageMode, pricingFound: Boolean(pricing) });
}
