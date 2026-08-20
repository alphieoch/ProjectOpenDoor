import { describe, expect, test } from "bun:test";
import { WEB_SEARCH_ADDON } from "./plans";
import {
  PLATFORM_TOOLS,
  canConfirmEnable,
  decideToolDisable,
  decideToolEnable,
  formatToolCost,
  formatUsdCents,
  getPlatformTool,
  monthlyAddonLabel,
  nextToolStatus,
  usageCostCents,
} from "./platform-tools";

describe("platform tools catalog", () => {
  test("ships the same five first-party workflow tools", () => {
    expect(PLATFORM_TOOLS.map((t) => t.id)).toEqual([
      "web_search",
      "code_execution",
      "document_analysis",
      "image_generation",
      "data_extraction",
    ]);
  });

  test("looks up a tool by id and ignores unknown ids", () => {
    expect(getPlatformTool("web_search")?.endpoint).toBe("POST /v1/plugins/web-search");
    expect(getPlatformTool("not-a-tool")).toBeUndefined();
  });
});

describe("usage cost", () => {
  test("formats per-call prices and monthly addon copy", () => {
    const search = getPlatformTool("web_search")!;
    expect(formatUsdCents(2)).toBe("$0.02");
    expect(formatToolCost(search)).toBe("$0.02 / call");
    expect(monthlyAddonLabel(search)).toBe(`or $${WEB_SEARCH_ADDON.amountUsd}/month add-on`);
    expect(monthlyAddonLabel(getPlatformTool("code_execution")!)).toBeNull();
  });

  test("charges per call or per 1k units", () => {
    const search = getPlatformTool("web_search")!;
    expect(usageCostCents(search, 3)).toBe(6);
    expect(
      usageCostCents(
        { ...search, billing: { kind: "per_1k", amountCents: 5, unitLabel: "tokens" } },
        1001
      )
    ).toBe(10);
    expect(usageCostCents(search, 0)).toBe(0);
  });
});

describe("enable / disable helpers", () => {
  const search = getPlatformTool("web_search")!;

  test("site-admin unlimited bypasses the prepaid gate", () => {
    expect(
      canConfirmEnable({ unlimited: true, spendableCents: 0, usageCostCents: 2 })
    ).toEqual({ ok: true });
    expect(
      decideToolEnable({
        tool: search,
        currentStatus: null,
        unlimited: true,
        spendableCents: 0,
      })
    ).toEqual({ ok: true, alreadyEnabled: false });
  });

  test("blocks enable when the org cannot cover one call", () => {
    const denied = decideToolEnable({
      tool: search,
      currentStatus: null,
      spendableCents: 0,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(402);
  });

  test("re-enable is idempotent and disable needs a row", () => {
    expect(
      decideToolEnable({
        tool: search,
        currentStatus: "enabled",
        spendableCents: 0,
      })
    ).toEqual({ ok: true, alreadyEnabled: true });
    expect(decideToolDisable({ currentStatus: null }).ok).toBe(false);
    expect(decideToolDisable({ currentStatus: "enabled" })).toEqual({
      ok: true,
      alreadyDisabled: false,
    });
    expect(nextToolStatus("disabled", "enable")).toBe("enabled");
    expect(nextToolStatus("enabled", "disable")).toBe("disabled");
  });

  test("unknown tool ids are 404", () => {
    const missing = decideToolEnable({
      tool: undefined,
      currentStatus: null,
      spendableCents: 100,
    });
    expect(missing).toEqual({ ok: false, status: 404, error: "Tool not found" });
  });
});
