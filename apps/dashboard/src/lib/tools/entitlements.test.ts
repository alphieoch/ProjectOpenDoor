import { describe, expect, test } from "bun:test";
import { getPlatformTool } from "@opendoor/shared";
import { publicToolRow } from "./catalog";

describe("publicToolRow", () => {
  test("shows usage cost and available until the org enables it", () => {
    const tool = getPlatformTool("web_search")!;
    const row = publicToolRow(tool, null);
    expect(row.status).toBe("available");
    expect(row.cost.perCallCents).toBe(2);
    expect(row.cost.label).toBe("$0.02 / call");
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
});
