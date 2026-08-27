import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canAccessSiteAdmin } from "../auth";
import {
  asCount,
  countInStatuses,
  countsByKey,
  creditsCentsToUsd,
  errorRatePct,
  formatUsdCompact,
  sumRecord,
} from "./overview";

describe("admin overview aggregations", () => {
  test("counts and error rate stay numeric", () => {
    expect(asCount("12")).toBe(12);
    expect(asCount(null)).toBe(0);
    expect(errorRatePct(1, 10)).toBe(10);
    expect(errorRatePct(0, 0)).toBe(0);
    expect(errorRatePct(1, 3)).toBe(33.3);
  });

  test("groups plan and status rows", () => {
    const byPlan = countsByKey([
      { key: "free", count: 4 },
      { key: "pro", count: "2" },
      { key: " ", count: 1 },
    ]);
    expect(byPlan).toEqual({ free: 4, pro: 2, unknown: 1 });
    expect(sumRecord(byPlan)).toBe(7);
    expect(countInStatuses({ running: 3, stopped: 1, busy: 2 }, ["running", "busy"])).toBe(5);
  });

  test("formats wallet cents as dollars", () => {
    expect(creditsCentsToUsd(2500)).toBe(25);
    expect(formatUsdCompact(12.5)).toBe("$12.50");
  });
});

describe("site admin gate", () => {
  test("only is_site_admin sessions pass", () => {
    expect(canAccessSiteAdmin(null)).toBe(false);
    expect(canAccessSiteAdmin({ isSiteAdmin: false })).toBe(false);
    expect(canAccessSiteAdmin({ isSiteAdmin: true })).toBe(true);
  });
});

describe("admin overview page stays server-first", () => {
  test("dashboard admin and home pages do not opt into a client graph", () => {
    const admin = readFileSync(join(import.meta.dir, "../../app/dashboard/admin/page.tsx"), "utf8");
    const home = readFileSync(join(import.meta.dir, "../../app/dashboard/page.tsx"), "utf8");
    const marketing = readFileSync(join(import.meta.dir, "../../app/page.tsx"), "utf8");
    expect(admin.trimStart().startsWith('"use client"')).toBe(false);
    expect(home.trimStart().startsWith('"use client"')).toBe(false);
    expect(marketing.trimStart().startsWith('"use client"')).toBe(false);
    expect(admin).toContain("requireSiteAdminOrNotFound");
    expect(admin).toContain("loadAdminOverview");
    expect(admin).not.toMatch(/from ["']@react-three|from ["']three["']|from ["']@xyflow/);
  });
});
