import { and, eq, gt, sql } from "drizzle-orm";
import {
  CreditService,
  grantExpiresAt,
  isLedgerBucketExpired,
  type LedgerBucket,
  type LedgerBucketType,
} from "@opendoor/shared";
import { creditLedgerBuckets, creditTransactions, db, organizations } from "@opendoor/database";

function asLedger(row: {
  id: string;
  remainingAmountCents: number;
  bucketType: string;
  expiresAt: Date | null;
  createdAt: Date;
}): LedgerBucket {
  const type = row.bucketType as LedgerBucketType;
  return {
    id: row.id,
    remainingAmountCents: row.remainingAmountCents,
    bucketType:
      type === "subscription_grant" || type === "top_up_prepaid" || type === "bonus"
        ? type
        : "top_up_prepaid",
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

async function syncOrgCreditsFromLedger(tx: typeof db, orgId: string, now = new Date()) {
  const rows = await tx.query.creditLedgerBuckets.findMany({
    where: eq(creditLedgerBuckets.organizationId, orgId),
  });
  let remaining = 0;
  let welcome = 0;
  let welcomeExpires: Date | null = null;
  for (const row of rows) {
    if (isLedgerBucketExpired(asLedger(row), now) || row.remainingAmountCents <= 0) continue;
    remaining += row.remainingAmountCents;
    if (row.bucketType === "bonus") {
      welcome += row.remainingAmountCents;
      if (row.expiresAt && (!welcomeExpires || row.expiresAt > welcomeExpires)) {
        welcomeExpires = row.expiresAt;
      }
    }
  }
  await tx
    .update(organizations)
    .set({
      creditsUsdCents: remaining,
      welcomeCreditsUsdCents: welcome,
      welcomeExpiresAt: welcomeExpires,
    })
    .where(eq(organizations.id, orgId));
  return remaining;
}

export async function grantCreditBucket(args: {
  organizationId: string;
  amountCents: number;
  bucketType: LedgerBucketType;
  currency?: string;
  now?: Date;
}) {
  const amount = Math.max(0, Math.round(args.amountCents || 0));
  if (amount <= 0) return null;
  const now = args.now || new Date();
  const [row] = await db
    .insert(creditLedgerBuckets)
    .values({
      organizationId: args.organizationId,
      initialAmountCents: amount,
      remainingAmountCents: amount,
      currency: args.currency || "USD",
      bucketType: args.bucketType,
      expiresAt: grantExpiresAt(args.bucketType, now),
      createdAt: now,
    })
    .returning();
  return row;
}

export async function spendFifoCredits(args: {
  organizationId: string;
  amountCents: number;
  requestId?: string | null;
  allowBonus?: boolean;
  source?: string;
  userId?: string | null;
}) {
  const amount = Math.max(0, Math.round(args.amountCents || 0));
  if (amount <= 0) return 0;

  return db.transaction(async (tx) => {
    const now = new Date();
    const org = await tx.query.organizations.findFirst({
      where: eq(organizations.id, args.organizationId),
      columns: { creditsUsdCents: true },
    });
    if (!org) throw new Error("Organization not found");

    const rows = await tx.query.creditLedgerBuckets.findMany({
      where: and(
        eq(creditLedgerBuckets.organizationId, args.organizationId),
        gt(creditLedgerBuckets.remainingAmountCents, 0)
      ),
    });

    if (!rows.length) {
      const current = Number(org.creditsUsdCents || 0);
      if (current < amount) throw new Error("Insufficient prepaid balance");
      const newBalance = current - amount;
      await tx
        .update(organizations)
        .set({ creditsUsdCents: newBalance })
        .where(eq(organizations.id, args.organizationId));
      await tx.insert(creditTransactions).values({
        organizationId: args.organizationId,
        kind: "usage",
        amountCents: -amount,
        balanceAfterCents: newBalance,
        requestId: args.requestId || null,
        metadata: { source: args.source || "fifo_legacy", userId: args.userId || null },
      });
      return newBalance;
    }

    const result = CreditService.consume(rows.map(asLedger), amount, now, {
      allowBonus: Boolean(args.allowBonus),
    });
    if (result.ok === false) {
      throw new Error(
        result.reason === "no_prepaid"
          ? "Included credit is used up and prepaid balance is $0."
          : "Insufficient prepaid balance"
      );
    }

    for (const take of result.deductions) {
      await tx
        .update(creditLedgerBuckets)
        .set({
          remainingAmountCents: sql`${creditLedgerBuckets.remainingAmountCents} - ${take.takeCents}`,
        })
        .where(eq(creditLedgerBuckets.id, take.id));
    }

    const newBalance = await syncOrgCreditsFromLedger(tx as unknown as typeof db, args.organizationId, now);
    await tx.insert(creditTransactions).values({
      organizationId: args.organizationId,
      kind: "usage",
      amountCents: -amount,
      balanceAfterCents: newBalance,
      requestId: args.requestId || null,
      metadata: {
        source: args.source || "fifo",
        userId: args.userId || null,
        deductions: result.deductions,
      },
    });
    return newBalance;
  });
}
