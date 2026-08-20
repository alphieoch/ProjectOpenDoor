import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collapsedRailItems,
  DASHBOARD_SIDEBAR_COLLAPSED_CLASS,
  DASHBOARD_SIDEBAR_COLLAPSED_PX,
  DASHBOARD_SIDEBAR_CONTENT_OFFSET_CLASS,
  DASHBOARD_SIDEBAR_EXPANDED_CLASS,
  DASHBOARD_SIDEBAR_EXPANDED_PX,
  DASHBOARD_SIDEBAR_HOVER_LEAVE_MS,
  dashboardSidebarLeaveDelay,
  isDashboardSidebarExpanded,
} from "./dashboard-sidebar";

describe("dashboard sidebar collapse", () => {
  test("collapsed rail is 48px and expanded panel is 260px", () => {
    expect(DASHBOARD_SIDEBAR_COLLAPSED_PX).toBe(48);
    expect(DASHBOARD_SIDEBAR_EXPANDED_PX).toBe(260);
    expect(DASHBOARD_SIDEBAR_COLLAPSED_CLASS).toBe("w-12");
    expect(DASHBOARD_SIDEBAR_EXPANDED_CLASS).toBe("w-[260px]");
    expect(DASHBOARD_SIDEBAR_CONTENT_OFFSET_CLASS).toBe("md:ml-12");
  });

  test("hover or focus expands; idle stays collapsed", () => {
    expect(isDashboardSidebarExpanded({ hovered: false, focused: false })).toBe(false);
    expect(isDashboardSidebarExpanded({ hovered: true, focused: false })).toBe(true);
    expect(isDashboardSidebarExpanded({ hovered: false, focused: true })).toBe(true);
    expect(isDashboardSidebarExpanded({ hovered: true, focused: true })).toBe(true);
  });

  test("leave delay matches the OpenBot rail unless motion is reduced", () => {
    expect(dashboardSidebarLeaveDelay(false)).toBe(DASHBOARD_SIDEBAR_HOVER_LEAVE_MS);
    expect(dashboardSidebarLeaveDelay(true)).toBe(0);
  });

  test("nested OpenBot and AI Assistants stay as collapsed icon rows", () => {
    const items = [
      { id: "search" },
      {
        id: "/dashboard/agents",
        children: [{ id: "/dashboard/openbot" }, { id: "/dashboard/ai-assistants" }],
      },
    ];
    expect(collapsedRailItems(items).map((item) => item.id)).toEqual([
      "search",
      "/dashboard/agents",
      "/dashboard/openbot",
      "/dashboard/ai-assistants",
    ]);
  });

  test("sidebar and frame use overlay-on-hover classes (icon width reserved)", () => {
    const sidebar = readFileSync(
      join(import.meta.dir, "../components/ui/dashboard-sidebar.tsx"),
      "utf8",
    );
    const frame = readFileSync(
      join(import.meta.dir, "../components/dashboard/dashboard-frame.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("DASHBOARD_SIDEBAR_COLLAPSED_CLASS");
    expect(sidebar).toContain("DASHBOARD_SIDEBAR_EXPANDED_CLASS");
    expect(sidebar).toContain("collapsedRailItems");
    expect(sidebar).toContain('data-collapsed');
    expect(sidebar).toContain("title={collapsed");
    expect(frame).toContain("DASHBOARD_SIDEBAR_CONTENT_OFFSET_CLASS");
    expect(frame).toContain("md:ml-12");
    expect(frame).not.toContain("md:ml-[260px]");
    expect(sidebar).toContain('"w-12"');
    expect(sidebar).toContain('"w-[260px]"');
  });
});
