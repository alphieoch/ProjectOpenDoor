import { describe, expect, test } from "bun:test";
import {
  SEARCH_QUERY_LIST_CENTS,
  SEARCH_TOOL_ID,
  decideToolCharge,
  decideToolEnable,
  getPlatformTool,
} from "@opendoor/shared";
import { publicToolRow } from "./catalog";

describe("publicToolRow", () => {
  test("shows usage cost and available until the org enables it", () => {
    const tool = getPlatformTool("web_search")!;
    const row = publicToolRow(tool, null);
    expect(row.status).toBe("available");
    expect(row.cost.perCallCents).toBe(SEARCH_QUERY_LIST_CENTS);
    expect(row.cost.label).toBe("$0.10 / call");
    expect(row.monthlyAddon).toContain("$20/month");
    expect(row.enabledAt).toBeNull();
  });

  test("marks an enabled entitlement with the stored timestamp", () => {
    const tool = getPlatformTool("code_execution")!;
    const row = publicToolRow(tool, {
      status: "enabled",
      enabledAt: "2026-08-20T00:00:00.000Z",
    });
    expect(row.status).toBe("enabled");
    expect(row.enabledAt).toBe("2026-08-20T00:00:00.000Z");
    expect(row.monthlyAddon).toBeNull();
  });

  test("enterprise catalog shows Search included, not the $0.10 paywall", () => {
    const tool = getPlatformTool(SEARCH_TOOL_ID)!;
    const row = publicToolRow(tool, null, { includedInPlan: true, addonActive: true });
    expect(row.includedInPlan).toBe(true);
    expect(row.addonActive).toBe(true);
    expect(row.cost.label).toBe("Included");
    expect(row.cost.perCallCents).toBe(0);
    expect(row.monthlyAddon).toBe("Included with Enterprise");
    expect(row.status).toBe("available");
  });

  test("OpenDoor Search catalog id is search and stays usage-billed", () => {
    const tool = getPlatformTool(SEARCH_TOOL_ID)!;
    expect(tool.id).toBe("search");
    expect(tool.name).toBe("OpenDoor Search");
    expect(tool.endpoint).toBe("POST /api/tools/search");
    const row = publicToolRow(tool, null);
    expect(row.id).toBe(SEARCH_TOOL_ID);
    expect(row.status).toBe("available");
    expect(row.cost.perCallCents).toBe(SEARCH_QUERY_LIST_CENTS);
    expect(row.cost.label).toBe("$0.10 / query");
    expect(row.description).toMatch(/Vertex/i);
    expect(row.description).not.toMatch(/You\.com|Serper|Brave|API key/i);
  });

  test("enabling Search requires spendable credit unless unlimited", () => {
    const tool = getPlatformTool(SEARCH_TOOL_ID)!;
    const denied = decideToolEnable({
      tool,
      currentStatus: null,
      spendableCents: 0,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(402);
    expect(
      decideToolEnable({
        tool,
        currentStatus: null,
        unlimited: true,
        spendableCents: 0,
      })
    ).toEqual({ ok: true, alreadyEnabled: false });
    expect(
      decideToolEnable({
        tool,
        currentStatus: null,
        coveredByAddon: true,
        spendableCents: 0,
      })
    ).toEqual({ ok: true, alreadyEnabled: false });
    const entitled = publicToolRow(tool, {
      status: "enabled",
      enabledAt: "2026-08-20T12:00:00.000Z",
    });
    expect(entitled.status).toBe("enabled");
    expect(entitled.id).toBe("search");
  });

  test("Search debit matches catalog and fails closed without credit", () => {
    const tool = getPlatformTool(SEARCH_TOOL_ID)!;
    expect(rowCost(tool)).toBe(SEARCH_QUERY_LIST_CENTS);
    expect(decideToolCharge({ tool, spendableCents: 0 }).ok).toBe(false);
    expect(decideToolCharge({ tool, spendableCents: SEARCH_QUERY_LIST_CENTS })).toEqual({
      ok: true,
      chargeCents: SEARCH_QUERY_LIST_CENTS,
    });
    expect(decideToolCharge({ tool, spendableCents: 0, unlimited: true })).toEqual({
      ok: true,
      chargeCents: 0,
    });
  });
});

function rowCost(tool: NonNullable<ReturnType<typeof getPlatformTool>>) {
  return publicToolRow(tool, null).cost.perCallCents;
}
