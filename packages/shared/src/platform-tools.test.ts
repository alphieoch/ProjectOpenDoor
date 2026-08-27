import { describe, expect, test } from "bun:test";
import { WEB_SEARCH_ADDON, workspaceHasEnterpriseTools, workspaceHasWebSearchAddon } from "./plans";
import {
  PLATFORM_TOOLS,
  SEARCH_QUERY_LIST_CENTS,
  canConfirmEnable,
  decideToolCharge,
  decideToolDisable,
  decideToolEnable,
  SEARCH_TOOL_ID,
  formatToolCost,
  formatUsdCents,
  getPlatformTool,
  isSearchToolId,
  monthlyAddonLabel,
  nextToolStatus,
  searchQueryListCents,
  usageCostCents,
  usesWebSearchAddon,
} from "./platform-tools";

describe("platform tools catalog", () => {
  test("ships OpenDoor Search plus the first-party workflow tools", () => {
    expect(PLATFORM_TOOLS.map((t) => t.id)).toEqual([
      "search",
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
    expect(getPlatformTool("web_rag")?.id).toBe(SEARCH_TOOL_ID);
  });

  test("OpenDoor Search is catalog id search on our Vertex endpoint", () => {
    const tool = getPlatformTool(SEARCH_TOOL_ID);
    expect(tool?.id).toBe(SEARCH_TOOL_ID);
    expect(tool?.name).toBe("OpenDoor Search");
    expect(tool?.endpoint).toBe("POST /api/tools/search");
    expect(tool?.family).toBe("closed");
    expect(tool?.description).toMatch(/Vertex/i);
    expect(tool?.description).not.toMatch(/You\.com|Serper|Brave|API key/i);
    expect(tool?.billing.amountCents).toBe(SEARCH_QUERY_LIST_CENTS);
    expect(formatToolCost(tool!)).toBe("$0.10 / query");
  });
});

describe("usage cost", () => {
  test("formats per-call prices and monthly addon copy", () => {
    const search = getPlatformTool("web_search")!;
    expect(searchQueryListCents()).toBe(SEARCH_QUERY_LIST_CENTS);
    expect(search.billing.amountCents).toBe(SEARCH_QUERY_LIST_CENTS);
    expect(formatUsdCents(SEARCH_QUERY_LIST_CENTS)).toBe("$0.10");
    expect(formatToolCost(search)).toBe("$0.10 / call");
    expect(monthlyAddonLabel(search)).toBe(`or $${WEB_SEARCH_ADDON.amountUsd}/month add-on`);
    expect(monthlyAddonLabel(getPlatformTool("code_execution")!)).toBeNull();
  });

  test("charges per call or per 1k units", () => {
    const search = getPlatformTool("web_search")!;
    expect(usageCostCents(search, 3)).toBe(SEARCH_QUERY_LIST_CENTS * 3);
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
      canConfirmEnable({ unlimited: true, spendableCents: 0, usageCostCents: SEARCH_QUERY_LIST_CENTS })
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

  test("OpenDoor Search enable is gated like other closed tools", () => {
    const tool = getPlatformTool("search")!;
    expect(isSearchToolId(tool.id)).toBe(true);
    expect(usesWebSearchAddon(tool)).toBe(true);
    expect(
      decideToolEnable({
        tool,
        currentStatus: null,
        unlimited: true,
        spendableCents: 0,
      })
    ).toEqual({ ok: true, alreadyEnabled: false });
    const denied = decideToolEnable({
      tool,
      currentStatus: null,
      spendableCents: 0,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(402);
  });

  test("enterprise skips Search debit; free/pro still 402 without credits", () => {
    const tool = getPlatformTool(SEARCH_TOOL_ID)!;
    expect(
      decideToolCharge({
        tool,
        spendableCents: 0,
        coveredByAddon: workspaceHasWebSearchAddon({ plan: "enterprise" }),
      })
    ).toEqual({ ok: true, chargeCents: 0 });
    expect(
      decideToolCharge({
        tool,
        spendableCents: 0,
        coveredByAddon: workspaceHasEnterpriseTools({ plan: "free", isSiteAdmin: true }),
      })
    ).toEqual({ ok: true, chargeCents: 0 });
    expect(
      decideToolCharge({
        tool,
        spendableCents: 0,
        coveredByAddon: workspaceHasWebSearchAddon({ plan: "free" }),
      }).ok
    ).toBe(false);
    expect(
      decideToolCharge({
        tool,
        spendableCents: 0,
        coveredByAddon: workspaceHasWebSearchAddon({ plan: "pro" }),
      }).ok
    ).toBe(false);
    expect(decideToolCharge({ tool, spendableCents: 0 }).ok).toBe(false);
  });

  test("unpaid org cannot cover a Search query; debit matches catalog; admin bypass", () => {
    const tool = getPlatformTool(SEARCH_TOOL_ID)!;
    expect(usageCostCents(tool, 1)).toBe(SEARCH_QUERY_LIST_CENTS);
    expect(
      decideToolCharge({ tool, spendableCents: 0 })
    ).toEqual({
      ok: false,
      error: "OpenDoor Search needs $0.10 spendable credit. Top up on Billing.",
    });
    expect(
      decideToolCharge({ tool, spendableCents: SEARCH_QUERY_LIST_CENTS - 1 })
    ).toMatchObject({ ok: false });
    expect(
      decideToolCharge({ tool, spendableCents: SEARCH_QUERY_LIST_CENTS })
    ).toEqual({ ok: true, chargeCents: SEARCH_QUERY_LIST_CENTS });
    expect(
      decideToolCharge({ tool, spendableCents: 0, unlimited: true })
    ).toEqual({ ok: true, chargeCents: 0 });
    expect(
      decideToolCharge({ tool, spendableCents: 0, coveredByAddon: true })
    ).toEqual({ ok: true, chargeCents: 0 });
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
