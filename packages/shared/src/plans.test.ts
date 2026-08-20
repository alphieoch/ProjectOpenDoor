import { describe, expect, test } from "bun:test";
import {
  billingIsUnlimited,
  canCoverEstimatedSpend,
  familyClubValue,
  getPlan,
  PLANS,
  workspaceHasAgentsAddon,
  workspaceHasEnterpriseTools,
  workspaceHasWebSearchAddon,
} from "./plans";

describe("family club math", () => {
  test("Family is cheaper per person than Pro and the pool is bigger than 4 Pro tastes", () => {
    const v = familyClubValue("family");
    expect(v.seats).toBe(4);
    expect(v.perPersonUsd).toBeLessThan(PLANS.pro.amountUsd);
    expect(v.saveVsSoloUsd).toBeGreaterThan(0);
    expect(v.extraPoolCents).toBeGreaterThan(0);
    expect(v.poolCents).toBeLessThan(Math.round(v.priceUsd * 100));
  });

  test("Family Max keeps a larger house pool than 5 Pro tastes", () => {
    const v = familyClubValue("family_max");
    expect(v.seats).toBe(5);
    expect(v.priceUsd).toBe(99);
    expect(v.poolCents).toBe(7500);
    expect(v.poolCents).toBeGreaterThan(familyClubValue("family").poolCents);
    expect(v.extraPoolCents).toBeGreaterThan(0);
    expect(v.soloCreditCents).toBe(PLANS.pro.includedCreditsCents * 5);
  });
});

describe("enterprise tools pack", () => {
  test("enterprise seats and site admins get the governance/tools pack", () => {
    expect(workspaceHasEnterpriseTools({ plan: "enterprise" })).toBe(true);
    expect(workspaceHasEnterpriseTools({ plan: "Enterprise" })).toBe(true);
    expect(workspaceHasEnterpriseTools({ plan: "free", isSiteAdmin: true })).toBe(true);
    expect(workspaceHasEnterpriseTools({ plan: "pro", isSiteAdmin: true })).toBe(true);
    expect(workspaceHasEnterpriseTools({ plan: "free" })).toBe(false);
    expect(workspaceHasEnterpriseTools({ plan: "pro" })).toBe(false);
    expect(workspaceHasEnterpriseTools({ plan: "team" })).toBe(false);
    expect(workspaceHasEnterpriseTools({ plan: "family_max" })).toBe(false);
  });

  test("Search and Agents are included on Enterprise; Family Max keeps Agents only", () => {
    expect(workspaceHasWebSearchAddon({ plan: "enterprise" })).toBe(true);
    expect(workspaceHasAgentsAddon({ plan: "enterprise" })).toBe(true);
    expect(workspaceHasWebSearchAddon({ plan: "free" })).toBe(false);
    expect(workspaceHasWebSearchAddon({ plan: "pro" })).toBe(false);
    expect(workspaceHasAgentsAddon({ plan: "family_max" })).toBe(true);
    expect(workspaceHasWebSearchAddon({ plan: "family_max" })).toBe(false);
  });
});

describe("unlimited billing bypass", () => {
  test("site admins and the unlimited plan skip the prepaid gate", () => {
    expect(billingIsUnlimited({ isSiteAdmin: true, plan: "free" })).toBe(true);
    expect(billingIsUnlimited({ isSiteAdmin: false, plan: "unlimited" })).toBe(true);
    expect(billingIsUnlimited({ isSiteAdmin: false, plan: "enterprise" })).toBe(false);
    expect(billingIsUnlimited({ isSiteAdmin: false, plan: "pro" })).toBe(false);
    expect(
      canCoverEstimatedSpend({
        isSiteAdmin: true,
        plan: "enterprise",
        spendableCents: 0,
        estimatedCostCents: 250,
      })
    ).toBe(true);
    expect(
      canCoverEstimatedSpend({
        isSiteAdmin: false,
        plan: "enterprise",
        spendableCents: 0,
        estimatedCostCents: 250,
      })
    ).toBe(false);
    expect(
      canCoverEstimatedSpend({
        isSiteAdmin: false,
        plan: "pro",
        spendableCents: 400,
        estimatedCostCents: 250,
      })
    ).toBe(true);
  });
});

describe("getPlan maxApiKeys", () => {
  test("every catalog plan exposes a finite key cap", () => {
    expect(getPlan("free").maxApiKeys).toBe(3);
    expect(getPlan("starter").maxApiKeys).toBe(3);
    expect(getPlan("pro").maxApiKeys).toBe(10);
    expect(getPlan("enterprise").maxApiKeys).toBe(500);
    expect(getPlan("not-a-plan").maxApiKeys).toBe(getPlan("free").maxApiKeys);
    expect(getPlan(undefined).maxApiKeys).toBeGreaterThan(0);
  });
});
