import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  organizations,
  requests,
  creditTransactions,
} from "@opendoor/database";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { expireWelcomeIfNeeded, getMonthCreditActivity, orgHasUnlimitedSpend } from "@/lib/credits";
import { billingIsUnlimited, creditWaterfall, getPlan, includedCreditCents } from "@opendoor/shared";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function getPlanBudgetLimitCents(): number {
  return 0;
}

function getWindowStart(nowMs: number): Date {
  return new Date(Math.floor(nowMs / FOUR_HOURS_MS) * FOUR_HOURS_MS);
}

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        id: true,
        plan: true,
        creditsUsdCents: true,
        welcomeCreditsUsdCents: true,
        welcomeExpiresAt: true,
        autoRechargeEnabled: true,
        autoRechargeAmountCents: true,
        autoRechargeThresholdCents: true,
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const unlimited = await orgHasUnlimitedSpend(orgId, { isSiteAdmin: session.isSiteAdmin });
    const unlimitedReason = session.isSiteAdmin
      ? "site_admin"
      : billingIsUnlimited({ plan: org.plan })
        ? "plan"
        : null;
    const buckets = await expireWelcomeIfNeeded(org);
    const activity = await getMonthCreditActivity(orgId);
    const waterfall = creditWaterfall({ buckets, ...activity });

    const now = Date.now();
    const windowStart = getWindowStart(now);
    const limitCents = getPlanBudgetLimitCents();

    const planUsageRows = await db
      .select({
        total: sql<number>`COALESCE(SUM(${requests.costUsd}), 0)`,
      })
      .from(requests)
      .where(
        and(
          eq(requests.organizationId, orgId),
          eq(requests.status, "success"),
          gte(requests.createdAt, windowStart)
        )
      );

    const usedUsd = Number(planUsageRows[0]?.total || 0);
    const usedCents = Math.ceil(usedUsd * 100);

    const recentTransactions = await db.query.creditTransactions.findMany({
      where: eq(creditTransactions.organizationId, orgId),
      orderBy: [desc(creditTransactions.createdAt)],
      limit: 20,
    });

    return NextResponse.json({
      plan: org.plan,
      planName: getPlan(org.plan).name,
      unlimited,
      unlimitedReason,
      isSiteAdmin: Boolean(session.isSiteAdmin),
      creditsUsdCents: buckets.totalCents,
      welcomeCreditsUsdCents: buckets.welcomeCents,
      paidCreditsUsdCents: buckets.paidCents,
      includedQuotaCents: waterfall.quotaCents,
      prepaidCreditsUsdCents: waterfall.prepaidCents,
      includedMonthlyCents: includedCreditCents(org.plan, 1),
      cutOff: unlimited ? false : waterfall.cutOff,
      welcomeExpiresAt: buckets.expiresAt ? buckets.expiresAt.toISOString() : null,
      planBudget: {
        usedCents,
        totalCents: limitCents,
        remainingCents: Math.max(0, limitCents - usedCents),
        resetsAt: new Date(windowStart.getTime() + FOUR_HOURS_MS).toISOString(),
      },
      autoRecharge: {
        enabled: Boolean(org.autoRechargeEnabled),
        amountCents: Number(org.autoRechargeAmountCents || 0),
        thresholdCents: Number(org.autoRechargeThresholdCents || 0),
      },
      recentTransactions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch billing balance";
    console.error("Billing balance error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
