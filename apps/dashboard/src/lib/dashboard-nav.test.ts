import { describe, expect, test } from "bun:test";
import { dashboardNavGroups, navGroupsForViewer } from "./dashboard-nav";

describe("dashboard nav admin group", () => {
  test("hides the Admin group unless the viewer is a site admin", () => {
    const ids = (opts: { isSiteAdmin?: boolean; protectedChild?: boolean }) =>
      navGroupsForViewer(opts).map((group) => group.id);

    expect(ids({})).not.toContain("admin");
    expect(ids({ isSiteAdmin: false })).not.toContain("admin");
    expect(ids({ isSiteAdmin: true })).toContain("admin");

    const admin = navGroupsForViewer({ isSiteAdmin: true }).find((group) => group.id === "admin");
    expect(admin?.items.map((item) => item.href)).toEqual(["/dashboard/admin"]);
  });

  test("source nav still lists Admin as site-admin-only", () => {
    const admin = dashboardNavGroups.find((group) => group.id === "admin");
    expect(admin?.siteAdminOnly).toBe(true);
  });
});
