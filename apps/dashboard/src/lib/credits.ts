import { creditTransactions, organizations, users } from "@opendoor/database";
import { spendFifoCredits } from "@/lib/credit-ledger";
import {
  billingIsUnlimited,
  creditWaterfall,
  evaluateMonthlySeatCap,
  splitCreditBuckets,
  spendableCents,
  welcomeAllowedForFamily,
  type CreditBuckets,
  type CreditWaterfall,
} from "@opendoor/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export async function expireWelcomeIfNeeded(
  org: {
    id: string;
    creditsUsdCents?: number | null;
    welcomeCreditsUsdCents?: number | null;
    welcomeExpiresAt?: Date | string | null;
  }
): Promise<CreditBuckets> {
  const buckets = splitCreditBuckets(org);
  if (!buckets.expired || buckets.clawbackCents <= 0) return buckets;

  const db = getDb();
  const nextTotal = Math.max(0, buckets.totalCents - buckets.clawbackCents);

  await db
    .update(organizations)
    .set({
      creditsUsdCents: nextTotal,
      welcomeCreditsUsdCents: 0,
    })
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

function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getMonthCreditActivity(orgId: string, now = new Date()) {
  const db = getDb();
  const rows = await db
    .select({
      kind: creditTransactions.kind,
      total: sql<number>`COALESCE(SUM(${creditTransactions.amountCents}), 0)`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.organizationId, orgId),
        gte(creditTransactions.createdAt, monthStartUtc(now))
      )
    )
    .groupBy(creditTransactions.kind);

  let monthPlanGrantCents = 0;
  let monthUsageCents = 0;
  for (const row of rows) {
    const total = Number(row.total || 0);
    if (row.kind === "plan_grant") monthPlanGrantCents += Math.max(0, total);
    if (row.kind === "usage") monthUsageCents += Math.max(0, -total);
  }
  return { monthPlanGrantCents, monthUsageCents };
}

export async function getOrgCreditWaterfall(orgId: string): Promise<{
  buckets: CreditBuckets;
  waterfall: CreditWaterfall;
} | null> {
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      id: true,
      creditsUsdCents: true,
      welcomeCreditsUsdCents: true,
      welcomeExpiresAt: true,
    },
  });
  if (!org) return null;
  const buckets = await expireWelcomeIfNeeded(org);
  const activity = await getMonthCreditActivity(orgId);
  return {
    buckets,
    waterfall: creditWaterfall({ buckets, ...activity }),
  };
}

export function spendableFromWaterfall(
  waterfall: CreditWaterfall,
  family: string | null | undefined
) {
  return welcomeAllowedForFamily(family)
    ? waterfall.spendableOpenCents
    : waterfall.spendableClosedCents;
}

export async function getMonthUserSpendCents(orgId: string, userId: string, now = new Date()) {
  const db = getDb();
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.amountCents} < 0 THEN -${creditTransactions.amountCents} ELSE 0 END), 0)`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.organizationId, orgId),
        gte(creditTransactions.createdAt, monthStartUtc(now)),
        sql`${creditTransactions.metadata}->>'userId' = ${userId}`,
      ),
    );
  return Number(row?.total || 0);
}

export async function assertUserMonthlySeatCap(
  orgId: string,
  userId: string | null | undefined,
  estimatedCostCents = 0,
): Promise<{ ok: true } | { ok: false; status: 402; detail: string; usedCents: number; capCents: number }> {
  if (!userId) return { ok: true };
  const db = getDb();
  const member = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.organizationId, orgId)),
    columns: { monthlyCreditSubCapCents: true, isSiteAdmin: true },
  });
  if (!member || member.isSiteAdmin) return { ok: true };
  const usedCents = await getMonthUserSpendCents(orgId, userId);
  const decision = evaluateMonthlySeatCap({
    monthlyCreditSubCapCents: member.monthlyCreditSubCapCents,
    usedCents,
    estimatedCostCents,
  });
  if (decision.ok) return { ok: true };
  return {
    ok: false,
    status: 402,
    detail: decision.error,
    usedCents: decision.usedCents,
    capCents: decision.capCents,
  };
}

export async function orgHasUnlimitedSpend(
  orgId: string,
  opts?: { isSiteAdmin?: boolean | null }
) {
  if (billingIsUnlimited({ isSiteAdmin: opts?.isSiteAdmin })) return true;
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { id: true, plan: true },
  });
  if (!org) return false;
  if (billingIsUnlimited({ plan: org.plan })) return true;
  const siteAdmin = await db.query.users.findFirst({
    where: and(eq(users.organizationId, orgId), eq(users.isSiteAdmin, true)),
    columns: { id: true },
  });
  return Boolean(siteAdmin);
}

export async function assertOrgCanSpend(
  orgId: string,
  family: "closed" | "open_weight",
  opts?: { isSiteAdmin?: boolean | null; userId?: string | null; estimatedCostCents?: number }
): Promise<
  | { ok: true; waterfall: CreditWaterfall; buckets: CreditBuckets; unlimited?: boolean }
  | { ok: false; status: 402; waterfall: CreditWaterfall; buckets: CreditBuckets; detail: string }
> {
  if (await orgHasUnlimitedSpend(orgId, opts)) {
    const state = await getOrgCreditWaterfall(orgId);
    const buckets = state?.buckets || splitCreditBuckets({});
    const waterfall = state?.waterfall || creditWaterfall({
      buckets,
      monthPlanGrantCents: 0,
      monthUsageCents: 0,
    });
    return { ok: true, waterfall, buckets, unlimited: true };
  }

  const state = await getOrgCreditWaterfall(orgId);
  if (!state) {
    const empty = creditWaterfall({
      buckets: splitCreditBuckets({}),
      monthPlanGrantCents: 0,
      monthUsageCents: 0,
    });
    return {
      ok: false,
      status: 402,
      waterfall: empty,
      buckets: splitCreditBuckets({}),
      detail: "Organization not found.",
    };
  }

  const seatCap = await assertUserMonthlySeatCap(orgId, opts?.userId, opts?.estimatedCostCents);
  if (!seatCap.ok) {
    return {
      ok: false,
      status: 402,
      waterfall: state.waterfall,
      buckets: state.buckets,
      detail: seatCap.detail,
    };
  }

  const spendable = spendableFromWaterfall(state.waterfall, family);
  if (spendable > 0) {
    return { ok: true, waterfall: state.waterfall, buckets: state.buckets };
  }

  const welcomeBlocked =
    !welcomeAllowedForFamily(family) &&
    state.buckets.welcomeCents > 0 &&
    state.buckets.paidCents <= 0;

  return {
    ok: false,
    status: 402,
    waterfall: state.waterfall,
    buckets: state.buckets,
    detail: welcomeBlocked
      ? "Welcome credit is for open-weight models only. Add prepaid credit to keep this assistant running."
      : "Included credit is used up and prepaid balance is $0. Top up on Billing to keep this assistant running.",
  };
}

export async function debitOrgUsage(
  orgId: string,
  amountCents: number,
  requestId?: string,
  options?: { allowWelcome?: boolean; source?: string; userId?: string | null }
) {
  if (amountCents <= 0) return 0;
  if (await orgHasUnlimitedSpend(orgId)) return 0;
  return spendFifoCredits({
    organizationId: orgId,
    amountCents,
    requestId: requestId || null,
    allowBonus: Boolean(options?.allowWelcome),
    source: options?.source || "ai_assistant",
    userId: options?.userId || null,
  });
}
