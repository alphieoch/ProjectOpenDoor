/**
 * FIFO credit buckets (4-month subscription grants, prepaid top-ups, 30-day bonus).
 * Org `creditsUsdCents` stays dual-written as the sum of remaining non-expired buckets.
 */

export const SUBSCRIPTION_GRANT_DAYS = 120;
export const BONUS_EXPIRES_DAYS = 30;

export const LEDGER_BUCKET_TYPES = [
  "subscription_grant",
  "top_up_prepaid",
  "bonus",
] as const;

export type LedgerBucketType = (typeof LEDGER_BUCKET_TYPES)[number];

export type LedgerBucket = {
  id: string;
  remainingAmountCents: number;
  bucketType: LedgerBucketType;
  expiresAt: Date | null;
  createdAt: Date;
};

export type FifoDeduction = {
  id: string;
  takeCents: number;
  bucketType: LedgerBucketType;
};

export function grantExpiresAt(
  bucketType: LedgerBucketType,
  from = new Date()
): Date | null {
  if (bucketType === "subscription_grant") {
    return new Date(from.getTime() + SUBSCRIPTION_GRANT_DAYS * 24 * 60 * 60 * 1000);
  }
  if (bucketType === "bonus") {
    return new Date(from.getTime() + BONUS_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  }
  return null;
}

export function isLedgerBucketExpired(bucket: Pick<LedgerBucket, "expiresAt">, now = new Date()) {
  if (!bucket.expiresAt) return false;
  const t = bucket.expiresAt instanceof Date ? bucket.expiresAt.getTime() : new Date(bucket.expiresAt).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

export function isPrepaidBucket(type: LedgerBucketType) {
  return type === "top_up_prepaid" || type === "subscription_grant";
}

function eligibleBuckets(buckets: LedgerBucket[], now: Date, allowBonus: boolean) {
  return buckets
    .filter((b) => b.remainingAmountCents > 0 && !isLedgerBucketExpired(b, now))
    .filter((b) => allowBonus || b.bucketType !== "bonus")
    .sort((a, b) => {
      const ac = a.createdAt.getTime();
      const bc = b.createdAt.getTime();
      if (ac !== bc) return ac - bc;
      const ae = a.expiresAt ? a.expiresAt.getTime() : Number.POSITIVE_INFINITY;
      const be = b.expiresAt ? b.expiresAt.getTime() : Number.POSITIVE_INFINITY;
      return ae - be;
    });
}

export class CreditService {
  static remainingCents(buckets: LedgerBucket[], now = new Date(), allowBonus = true) {
    return eligibleBuckets(buckets, now, allowBonus).reduce(
      (sum, b) => sum + Math.max(0, b.remainingAmountCents),
      0
    );
  }

  static prepaidRemainingCents(buckets: LedgerBucket[], now = new Date()) {
    return eligibleBuckets(buckets, now, false)
      .filter((b) => isPrepaidBucket(b.bucketType))
      .reduce((sum, b) => sum + Math.max(0, b.remainingAmountCents), 0);
  }

  /**
   * Spend oldest non-expired remaining bucket first.
   * Rejects when remaining is 0 and there is no prepaid (grant/top-up) left.
   */
  static consume(
    buckets: LedgerBucket[],
    amountCents: number,
    now = new Date(),
    opts?: { allowBonus?: boolean }
  ):
    | { ok: true; deductions: FifoDeduction[]; remainingAfterCents: number }
    | { ok: false; reason: "insufficient" | "no_prepaid" } {
    const amount = Math.max(0, Math.round(amountCents || 0));
    if (amount <= 0) {
      return {
        ok: true,
        deductions: [],
        remainingAfterCents: CreditService.remainingCents(buckets, now, opts?.allowBonus !== false),
      };
    }

    const allowBonus = Boolean(opts?.allowBonus);
    const prepaid = CreditService.prepaidRemainingCents(buckets, now);
    const eligible = eligibleBuckets(buckets, now, allowBonus);
    const spendable = eligible.reduce((sum, b) => sum + b.remainingAmountCents, 0);

    if (spendable < amount) {
      return { ok: false, reason: prepaid <= 0 ? "no_prepaid" : "insufficient" };
    }
    if (prepaid <= 0 && !allowBonus) {
      return { ok: false, reason: "no_prepaid" };
    }

    let left = amount;
    const deductions: FifoDeduction[] = [];
    const remainingById = new Map(eligible.map((b) => [b.id, b.remainingAmountCents]));

    for (const bucket of eligible) {
      if (left <= 0) break;
      const take = Math.min(remainingById.get(bucket.id) || 0, left);
      if (take <= 0) continue;
      deductions.push({ id: bucket.id, takeCents: take, bucketType: bucket.bucketType });
      remainingById.set(bucket.id, (remainingById.get(bucket.id) || 0) - take);
      left -= take;
    }

    if (left > 0) return { ok: false, reason: "insufficient" };

    const remainingAfterCents = [...remainingById.values()].reduce((s, n) => s + n, 0);
    return { ok: true, deductions, remainingAfterCents };
  }
}
