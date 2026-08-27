import { describe, expect, test } from "bun:test";
import { PLANS } from "./plans";
import {
  SEAT_CAP_UPGRADE_COPY,
  checkoutSeatQuantity,
  evaluateMonthlySeatCap,
  evaluateSeatInvite,
  occupiedSeats,
  resolveMaxSeats,
  seatCapError,
} from "./seats";

describe("family seat pool", () => {
  test("Family allows a 4th member and rejects a 5th", () => {
    const maxSeats = resolveMaxSeats({ plan: "family" });
    expect(maxSeats).toBe(4);
    expect(evaluateSeatInvite({ memberCount: 3, maxSeats }).ok).toBe(true);
    const fifth = evaluateSeatInvite({ memberCount: 4, maxSeats });
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) {
      expect(fifth.error).toContain("All 4 seats are occupied");
      expect(fifth.error).toContain(SEAT_CAP_UPGRADE_COPY);
      expect(fifth.useBilling).toBe(true);
    }
  });

  test("Family Max allows a 5th member and rejects a 6th", () => {
    const maxSeats = resolveMaxSeats({ plan: "family_max" });
    expect(maxSeats).toBe(5);
    expect(evaluateSeatInvite({ memberCount: 4, maxSeats }).ok).toBe(true);
    expect(evaluateSeatInvite({ memberCount: 5, maxSeats }).ok).toBe(false);
  });

  test("pending family invites count toward the pool", () => {
    const maxSeats = resolveMaxSeats({ plan: "family" });
    expect(occupiedSeats({ memberCount: 3, pendingInviteCount: 1 })).toBe(4);
    const blocked = evaluateSeatInvite({ memberCount: 3, pendingInviteCount: 1, maxSeats });
    expect(blocked.ok).toBe(false);
  });
});

describe("team paid quantity", () => {
  test("invite is capped at the paid Stripe seat quantity", () => {
    const maxSeats = resolveMaxSeats({ plan: "team", paidSeatQuantity: 3 });
    expect(maxSeats).toBe(3);
    expect(evaluateSeatInvite({ memberCount: 2, pendingInviteCount: 0, maxSeats }).ok).toBe(true);
    const atCap = evaluateSeatInvite({ memberCount: 2, pendingInviteCount: 1, maxSeats });
    expect(atCap.ok).toBe(false);
    if (!atCap.ok) {
      expect(atCap.error).toBe(seatCapError(3));
      expect(atCap.error).toContain(SEAT_CAP_UPGRADE_COPY);
    }
  });

  test("checkout quantity is the paid seat count for per-seat plans", () => {
    expect(checkoutSeatQuantity("team", 8)).toBe(8);
    expect(checkoutSeatQuantity("team", 0)).toBe(1);
    expect(checkoutSeatQuantity("enterprise", 12)).toBe(12);
    expect(checkoutSeatQuantity("family", 8)).toBe(1);
    expect(PLANS.team.perSeat).toBe(true);
  });

  test("invite at cap fails with billing copy", () => {
    const decision = evaluateSeatInvite({
      memberCount: 1,
      pendingInviteCount: 0,
      maxSeats: resolveMaxSeats({ plan: "pro" }),
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("seat_cap");
      expect(decision.error).toContain(SEAT_CAP_UPGRADE_COPY);
    }
  });
});

describe("monthly seat spend cap", () => {
  test("uncapped seats can spend", () => {
    expect(evaluateMonthlySeatCap({ monthlyCreditSubCapCents: null, usedCents: 9_999 }).ok).toBe(true);
  });

  test("persisted monthlyCreditSubCapCents blocks further spend", () => {
    const blocked = evaluateMonthlySeatCap({
      monthlyCreditSubCapCents: 5000,
      usedCents: 5000,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toBe("Monthly seat credit cap reached");
      expect(blocked.monthlyCreditSubCapCents).toBe(5000);
    }
    expect(
      evaluateMonthlySeatCap({
        monthlyCreditSubCapCents: 5000,
        usedCents: 4900,
        estimatedCostCents: 200,
      }).ok,
    ).toBe(false);
    expect(
      evaluateMonthlySeatCap({
        monthlyCreditSubCapCents: 5000,
        usedCents: 4900,
        estimatedCostCents: 50,
      }).ok,
    ).toBe(true);
  });
});
