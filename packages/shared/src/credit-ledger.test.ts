import { describe, expect, test } from "bun:test";
import { CreditService, grantExpiresAt, type LedgerBucket } from "./credit-ledger";
import { applyFiveHourWindow, houseChatAllowanceForPlan, houseChatWindowPooled } from "./house-chat";
import { chatModeAllowed, DEFAULT_ALLOWED_CHAT_MODES } from "./chat-modes";
import { familyClubValue, PLANS, workspaceHasAgentsAddon } from "./plans";

function bucket(
  partial: Partial<LedgerBucket> & Pick<LedgerBucket, "id" | "remainingAmountCents" | "bucketType">
): LedgerBucket {
  return {
    createdAt: partial.createdAt || new Date("2026-01-01T00:00:00Z"),
    expiresAt: partial.expiresAt === undefined ? new Date("2026-05-01T00:00:00Z") : partial.expiresAt,
    ...partial,
  };
}

describe("FIFO credit buckets", () => {
  test("spends the oldest remaining grant first", () => {
    const older = bucket({
      id: "a",
      remainingAmountCents: 200,
      bucketType: "subscription_grant",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const newer = bucket({
      id: "b",
      remainingAmountCents: 400,
      bucketType: "subscription_grant",
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
    const result = CreditService.consume([newer, older], 250, new Date("2026-03-01T00:00:00Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deductions).toEqual([
      { id: "a", takeCents: 200, bucketType: "subscription_grant" },
      { id: "b", takeCents: 50, bucketType: "subscription_grant" },
    ]);
  });

  test("skips expired grants and rejects when no prepaid remains", () => {
    const expired = bucket({
      id: "old",
      remainingAmountCents: 800,
      bucketType: "subscription_grant",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      expiresAt: new Date("2025-05-01T00:00:00Z"),
    });
    const bonus = bucket({
      id: "bonus",
      remainingAmountCents: 500,
      bucketType: "bonus",
      createdAt: new Date("2026-03-01T00:00:00Z"),
      expiresAt: new Date("2026-03-31T00:00:00Z"),
    });
    const now = new Date("2026-03-15T00:00:00Z");
    const closed = CreditService.consume([expired, bonus], 100, now, { allowBonus: false });
    expect(closed.ok).toBe(false);
    if (closed.ok) return;
    expect(closed.reason).toBe("no_prepaid");

    const open = CreditService.consume([expired, bonus], 100, now, { allowBonus: true });
    expect(open.ok).toBe(true);
  });

  test("subscription grants expire in 120 days; bonus in 30; prepaid has no short expiry", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(grantExpiresAt("subscription_grant", from)?.toISOString()).toBe(
      new Date("2026-05-01T00:00:00Z").toISOString()
    );
    expect(grantExpiresAt("bonus", from)?.toISOString()).toBe(new Date("2026-01-31T00:00:00Z").toISOString());
    expect(grantExpiresAt("top_up_prepaid", from)).toBeNull();
  });
});

describe("5h chat windows", () => {
  test("missing window starts now with count 1", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const result = applyFiveHourWindow(null, 20, now);
    expect(result.reset).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.next.messageCount).toBe(1);
    expect(result.next.windowExpiresAt.getTime() - now.getTime()).toBe(5 * 60 * 60 * 1000);
  });

  test("active window increments until the cap then 429s until expiry", () => {
    const start = new Date("2026-08-19T12:00:00Z");
    const existing = {
      windowStartTime: start,
      windowExpiresAt: new Date(start.getTime() + 5 * 60 * 60 * 1000),
      messageCount: 19,
    };
    const mid = new Date(start.getTime() + 60 * 60 * 1000);
    const ok = applyFiveHourWindow(existing, 20, mid);
    expect(ok.allowed).toBe(true);
    expect(ok.next.messageCount).toBe(20);

    const blocked = applyFiveHourWindow(ok.next, 20, mid);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.next.messageCount).toBe(20);
  });

  test("expired window resets instead of staying blocked", () => {
    const start = new Date("2026-08-19T07:00:00Z");
    const existing = {
      windowStartTime: start,
      windowExpiresAt: new Date(start.getTime() + 5 * 60 * 60 * 1000),
      messageCount: 20,
    };
    const later = new Date("2026-08-19T12:01:00Z");
    const result = applyFiveHourWindow(existing, 20, later);
    expect(result.reset).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.next.messageCount).toBe(1);
  });
});

describe("family vs pro math", () => {
  test("Family is cheaper than 4× Pro and the pool is bigger than 4 Pro tastes", () => {
    const v = familyClubValue("family");
    expect(v.seats).toBe(4);
    expect(v.priceUsd).toBeLessThan(v.soloPriceUsd);
    expect(v.poolCents).toBeGreaterThan(v.soloCreditCents);
    expect(houseChatWindowPooled("family")).toBe(true);
    expect(houseChatAllowanceForPlan("family").periodMessageLimit).toBe(100);
  });

  test("Family Max vs 5× Pro: larger house pool; Agents included", () => {
    const v = familyClubValue("family_max");
    expect(v.seats).toBe(5);
    expect(v.priceUsd).toBe(99);
    expect(v.poolCents).toBe(7500);
    expect(v.soloPriceUsd).toBe(PLANS.pro.amountUsd * 5);
    expect(v.poolCents).toBeGreaterThan(v.soloCreditCents);
    expect(workspaceHasAgentsAddon({ plan: "family_max" })).toBe(true);
    expect(houseChatAllowanceForPlan("family_max")).toEqual({
      periodWindow: "5hour",
      periodMessageLimit: 225,
      weeklyMessageLimit: 675,
      pooled: true,
    });
  });
});

describe("permission lock", () => {
  test("MAX_FAST can be disabled per seat", () => {
    expect(chatModeAllowed(["flash", "auto", "thinking", "max"], "max_fast")).toBe(false);
    expect(chatModeAllowed(["flash", "auto", "thinking", "max"], "fast")).toBe(true);
    expect(chatModeAllowed(DEFAULT_ALLOWED_CHAT_MODES, "max_fast")).toBe(true);
    expect(chatModeAllowed(["flash", "auto"], "thinking")).toBe(false);
  });
});
