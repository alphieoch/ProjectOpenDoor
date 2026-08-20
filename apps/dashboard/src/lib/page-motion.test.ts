import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dashboardTransitionKey,
  isDashboardBleedRoute,
  isDashboardFillHeightRoute,
  MOTION_DURATION,
  motionDuration,
} from "./page-motion";

describe("dashboardTransitionKey", () => {
  test("keys Overview, Tools, Team, and Settings as distinct pathnames", () => {
    expect(dashboardTransitionKey("/dashboard")).toBe("/dashboard");
    expect(dashboardTransitionKey("/dashboard/tools")).toBe("/dashboard/tools");
    expect(dashboardTransitionKey("/dashboard/team")).toBe("/dashboard/team");
    expect(dashboardTransitionKey("/dashboard/settings")).toBe("/dashboard/settings");
  });

  test("keeps OpenBot, Chat, and Studio on one shell key", () => {
    expect(dashboardTransitionKey("/dashboard/openbot")).toBe("/dashboard/openbot");
    expect(dashboardTransitionKey("/dashboard/openbot/abc")).toBe("/dashboard/openbot");
    expect(dashboardTransitionKey("/dashboard/openbot/skills")).toBe("/dashboard/openbot");
    expect(dashboardTransitionKey("/dashboard/chat")).toBe("/dashboard/chat");
    expect(dashboardTransitionKey("/dashboard/chat/room-1")).toBe("/dashboard/chat");
    expect(dashboardTransitionKey("/dashboard/studio/new")).toBe("/dashboard/studio");
  });

  test("does not collapse Playground Media into Playground", () => {
    expect(dashboardTransitionKey("/dashboard/playground")).toBe("/dashboard/playground");
    expect(dashboardTransitionKey("/dashboard/playground/media")).toBe("/dashboard/playground/media");
  });

  test("groups agent desks without collapsing the agents list", () => {
    expect(dashboardTransitionKey("/dashboard/agents")).toBe("/dashboard/agents");
    expect(dashboardTransitionKey("/dashboard/agents/desk-1")).toBe("/dashboard/agents/*");
  });
});

describe("dashboard page chrome", () => {
  test("fill-height and bleed match the previous PageTransition exceptions", () => {
    expect(isDashboardFillHeightRoute("/dashboard")).toBe(false);
    expect(isDashboardFillHeightRoute("/dashboard/openbot")).toBe(true);
    expect(isDashboardFillHeightRoute("/dashboard/pricing")).toBe(true);
    expect(isDashboardBleedRoute("/dashboard/tools")).toBe(false);
    expect(isDashboardBleedRoute("/dashboard/openbot/abc")).toBe(true);
    expect(isDashboardBleedRoute("/dashboard/pricing")).toBe(false);
  });
});

describe("motionDuration", () => {
  test("zeros duration when the user prefers reduced motion", () => {
    expect(MOTION_DURATION.page).toBe(0.22);
    expect(MOTION_DURATION.pageInner).toBe(0.16);
    expect(motionDuration(MOTION_DURATION.page, false)).toBe(0.22);
    expect(motionDuration(MOTION_DURATION.page, true)).toBe(0);
    expect(motionDuration(MOTION_DURATION.pageInner, true)).toBe(0);
    expect(motionDuration(MOTION_DURATION.fade, null)).toBe(0.2);
  });
});

describe("dashboard motion wiring", () => {
  test("PageTransition keys AnimatePresence by the shell pathname", () => {
    const source = readFileSync(join(import.meta.dir, "../components/PageTransition.tsx"), "utf8");
    expect(source).toContain("AnimatePresence");
    expect(source).toContain("dashboardTransitionKey");
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("motionDuration");
    expect(source).not.toContain("rag-search");
  });

  test("MotionOverlay traps focus and honors reduced motion", () => {
    const source = readFileSync(join(import.meta.dir, "../components/motion.tsx"), "utf8");
    expect(source).toContain('role="dialog"');
    expect(source).toContain("aria-modal");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("useReducedMotion");
    expect(source).toContain('reducedMotion="user"');
  });

  test("dashboard error boundary keeps the shell when a page throws", () => {
    const errorPage = readFileSync(join(import.meta.dir, "../app/dashboard/error.tsx"), "utf8");
    const boundary = readFileSync(
      join(import.meta.dir, "../components/dashboard/dashboard-error-boundary.tsx"),
      "utf8",
    );
    expect(errorPage).toContain("DashboardErrorFallback");
    expect(boundary).toContain("componentDidCatch");
    expect(boundary).toContain("getDerivedStateFromError");
    expect(boundary).toContain("The dashboard shell is still up");
  });

  test("dashboard frame wraps chrome in MotionConfig and keeps the sidebar outside the main pane", () => {
    const source = readFileSync(
      join(import.meta.dir, "../components/dashboard/dashboard-frame.tsx"),
      "utf8",
    );
    expect(source).toContain("DashboardMotionConfig");
    expect(source).toContain("DashboardSidebar");
    expect(source).toContain("DashboardErrorBoundary");
    expect(source).toContain("PageTransition");
    expect(source).not.toContain("rag-search");
  });
});
