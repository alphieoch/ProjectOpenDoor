import { describe, expect, test } from "bun:test";
import {
  errorRateLabel,
  formatBalanceLabel,
  formatLatencyMs,
  formatUsdCents,
  periodEmptyCopy,
  splitModelTokens,
  summarizeDailyUsage,
  tokenSplit,
  unlimitedReasonLabel,
} from "./usage-format";

describe("formatUsdCents", () => {
  test("formats whole dollars without cents", () => {
    expect(formatUsdCents(2000)).toBe("$20");
  });

  test("keeps cents when present", () => {
    expect(formatUsdCents(1250)).toBe("$12.50");
  });
});

describe("formatBalanceLabel", () => {
  test("never renders $0 as the unlimited state", () => {
    expect(formatBalanceLabel({ unlimited: true, cents: 0 })).toBe("Unlimited");
    expect(formatBalanceLabel({ unlimited: false, cents: 0 })).toBe("$0");
    expect(formatBalanceLabel({ unlimited: false, cents: 400 })).toBe("$4");
  });
});

describe("tokenSplit", () => {
  test("returns a 60/40 split for 600/400", () => {
    expect(tokenSplit(600, 400)).toEqual({ promptPct: 60, completionPct: 40, total: 1000 });
  });

  test("is empty when there are no tokens", () => {
    expect(tokenSplit(0, 0)).toEqual({ promptPct: 0, completionPct: 0, total: 0 });
  });
});

describe("splitModelTokens", () => {
  test("prefers explicit per-model prompt and completion counts", () => {
    expect(
      splitModelTokens({
        totalTokens: 1000,
        promptTokens: 200,
        completionTokens: 50,
        orgPromptTokens: 900,
        orgCompletionTokens: 100,
      }),
    ).toEqual({ promptTokens: 200, completionTokens: 50 });
  });

  test("falls back to the org mix only when the model row has no split", () => {
    expect(
      splitModelTokens({
        totalTokens: 100,
        orgPromptTokens: 80,
        orgCompletionTokens: 20,
      }),
    ).toEqual({ promptTokens: 80, completionTokens: 20 });
  });
});

describe("summarizeDailyUsage", () => {
  test("sums the window and tracks whether status columns exist", () => {
    const totals = summarizeDailyUsage([
      { requests: 10, promptTokens: 100, completionTokens: 20, costUsd: 1.5, errorCount: 1 },
      { requests: 5, promptTokens: 50, completionTokens: 10, costUsd: 0.25, errorCount: 0 },
    ]);
    expect(totals).toEqual({
      requests: 15,
      promptTokens: 150,
      completionTokens: 30,
      cost: 1.75,
      errors: 1,
      hasStatus: true,
    });
  });
});

describe("errorRateLabel", () => {
  test("is an em dash until status columns exist", () => {
    expect(errorRateLabel(2, 10, false)).toBe("—");
    expect(errorRateLabel(1, 10, true)).toBe("10.0%");
  });
});

describe("periodEmptyCopy", () => {
  test("names the selected window", () => {
    expect(periodEmptyCopy(7).title).toBe("No usage this period");
    expect(periodEmptyCopy(7).body).toContain("last 7 days");
  });
});

describe("formatLatencyMs", () => {
  test("hides missing or zero latency", () => {
    expect(formatLatencyMs(null)).toBe("—");
    expect(formatLatencyMs(0)).toBe("—");
    expect(formatLatencyMs(142.8)).toBe("143ms");
  });
});

describe("unlimitedReasonLabel", () => {
  test("distinguishes site admin from the unlimited plan", () => {
    expect(unlimitedReasonLabel("site_admin")).toContain("Site admin");
    expect(unlimitedReasonLabel("plan")).toContain("Unlimited plan");
  });
});
