import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  organizations,
  requests,
  creditTransactions,
} from "@opendoor/database";
import { and, desc, eq, gte, sql } from "drizzle-orm";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function getPlanBudgetLimitCents(plan: string): number {
  if (plan === "pro") {
    return Number.parseInt(process.env.PLAN_BUDGET_PRO_PER_4H_CENTS || "500", 10);
  }
  if (plan === "enterprise") {
    return Number.parseInt(
      process.env.PLAN_BUDGET_ENTERPRISE_PER_4H_CENTS || "3000",
      10
    );
  }
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
        autoRechargeEnabled: true,
        autoRechargeAmountCents: true,
        autoRechargeThresholdCents: true,
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const now = Date.now();
    const windowStart = getWindowStart(now);
    const limitCents = getPlanBudgetLimitCents(org.plan);

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
      creditsUsdCents: Number(org.creditsUsdCents || 0),
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
  } catch (error: any) {
    console.error("Billing balance error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch billing balance" },
      { status: 500 }
    );
  }
}
