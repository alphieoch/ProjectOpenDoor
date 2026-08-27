import { describe, expect, test } from "bun:test";
import {
  buildAgentsQuotaView,
  catalogOptionsFor,
  describeAgentsQuota,
  modelDisplayName,
  stipendSpentCents,
} from "./agents-quota";

const models = [
  { id: "openweight-chat", label: "Open-weight chat", ready: true },
  { id: "claude-sonnet", label: "Claude Sonnet", ready: true },
];

describe("modelDisplayName", () => {
  test("uses the catalog label when the id is known", () => {
    expect(modelDisplayName(models, "claude-sonnet")).toBe("Claude Sonnet");
  });

  test("falls back to the raw id, or No model when empty", () => {
    expect(modelDisplayName(models, "mystery-model")).toBe("mystery-model");
    expect(modelDisplayName(models, "")).toBe("No model");
    expect(modelDisplayName(models, null)).toBe("No model");
  });
});

describe("catalogOptionsFor", () => {
  test("keeps the current id when it is not in the catalog", () => {
    expect(catalogOptionsFor(models, "mystery-model").map((model) => model.id)).toEqual([
      "mystery-model",
      "openweight-chat",
      "claude-sonnet",
    ]);
    expect(catalogOptionsFor(models, "claude-sonnet")).toEqual(models);
    expect(catalogOptionsFor(models, "")).toEqual(models);
  });
});

describe("stipendSpentCents", () => {
  test("is the included monthly grant minus what is still left", () => {
    expect(stipendSpentCents(2500, 800)).toBe(1700);
    expect(stipendSpentCents(2500, 4000)).toBe(0);
  });
});

describe("buildAgentsQuotaView", () => {
  test("prefers billing remaining balances and settings plan caps", () => {
    const view = buildAgentsQuotaView({
      settings: {
        usage: { bots: 3, running: 1, messages30d: 40 },
        limits: { bots: 3, maxBots: 10, running: 1, maxConcurrentAgents: 2, plan: "pro", addonActive: true },
        addon: { active: true, includedInPlan: false, amountUsd: 20, status: "active" },
      },
      balance: {
        creditsUsdCents: 1800,
        includedQuotaCents: 400,
        prepaidCreditsUsdCents: 1400,
        includedMonthlyCents: 2500,
      },
      capacity: { bots: 9, running: 9, maxBots: 99, maxConcurrentAgents: 99, plan: "free", addonActive: false },
      channelCount: 8,
    });

    expect(view.spendCents).toBe(2100);
    expect(view.remainingCreditsCents).toBe(1800);
    expect(view.remainingStipendCents).toBe(400);
    expect(view.prepaidCents).toBe(1400);
    expect(view.bots).toBe(3);
    expect(view.maxBots).toBe(10);
    expect(view.running).toBe(1);
    expect(view.maxConcurrent).toBe(2);
    expect(view.plan).toBe("pro");
    expect(view.addonLabel).toBe("$20/mo");
    expect(view.messages30d).toBe(40);
    expect(describeAgentsQuota(view)).toEqual({
      spend: "$21",
      remaining: "$18",
      stipend: "$4 of $25",
      agents: "3 / 10",
      running: "1 / 2",
    });
  });

  test("falls back to workspace capacity when settings have not loaded", () => {
    const view = buildAgentsQuotaView({
      capacity: {
        bots: 2,
        running: 1,
        maxBots: 5,
        maxConcurrentAgents: 1,
        plan: "student",
        addonActive: true,
      },
      channelCount: 2,
    });
    expect(view.bots).toBe(2);
    expect(view.maxBots).toBe(5);
    expect(view.running).toBe(1);
    expect(view.maxConcurrent).toBe(1);
    expect(view.plan).toBe("student");
    expect(view.addonActive).toBe(true);
    expect(view.spendCents).toBe(0);
  });
});
