import { creditTransactions, organizations } from "@opendoor/database";
import {
  creditWaterfall,
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

export async function assertOrgCanSpend(
  orgId: string,
  family: "closed" | "open_weight"
): Promise<
  | { ok: true; waterfall: CreditWaterfall; buckets: CreditBuckets }
  | { ok: false; status: 402; waterfall: CreditWaterfall; buckets: CreditBuckets; detail: string }
> {
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
  options?: { allowWelcome?: boolean; source?: string }
) {
  if (amountCents <= 0) return 0;
  const allowWelcome = Boolean(options?.allowWelcome);
  const db = getDb();

  return db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        creditsUsdCents: true,
        welcomeCreditsUsdCents: true,
        welcomeExpiresAt: true,
      },
    });
    if (!org) throw new Error("Organization not found");

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

    const spendable = spendableCents(buckets, allowWelcome);
    if (spendable < amountCents) {
      throw new Error(
        allowWelcome
          ? "Insufficient prepaid balance"
          : "Welcome credit cannot cover this charge. Add prepaid credit."
      );
    }

    const fromWelcome = allowWelcome ? Math.min(buckets.welcomeCents, amountCents) : 0;
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
        source: options?.source || "ai_assistant",
        from_welcome_cents: fromWelcome,
        from_paid_cents: amountCents - fromWelcome,
      },
    });

    return newBalance;
  });
}
