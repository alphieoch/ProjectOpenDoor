/** Shared Motion timings. `prefers-reduced-motion` callers pass duration 0. */

export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const MOTION_DURATION = {
  instant: 0,
  page: 0.22,
  pageInner: 0.16,
  fade: 0.2,
  stagger: 0.045,
  hover: 0.16,
  tap: 0.12,
  layout: 0.2,
} as const;

/** Persistent inner shells — outer page motion keys by prefix so the rail stays. */
const SHELL_PREFIXES = [
  "/dashboard/openbot",
  "/dashboard/chat",
  "/dashboard/studio",
  "/dashboard/governance",
  "/dashboard/premium",
] as const;

export function dashboardTransitionKey(pathname: string | null | undefined): string {
  const path = pathname || "/dashboard";
  if (path.startsWith("/dashboard/agents/") && path !== "/dashboard/agents") {
    return "/dashboard/agents/*";
  }
  for (const prefix of SHELL_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return prefix;
  }
  return path;
}

export function isDashboardFillHeightRoute(pathname: string): boolean {
  return (
    pathname === "/dashboard/playground" ||
    pathname === "/dashboard/chat" ||
    pathname.startsWith("/dashboard/chat/") ||
    pathname === "/dashboard/studio" ||
    pathname.startsWith("/dashboard/studio/") ||
    pathname === "/dashboard/governance" ||
    pathname.startsWith("/dashboard/governance/") ||
    (pathname.startsWith("/dashboard/agents/") && pathname !== "/dashboard/agents") ||
    pathname.startsWith("/dashboard/openbot") ||
    pathname === "/dashboard/training" ||
    pathname === "/dashboard/premium" ||
    pathname.startsWith("/dashboard/premium/") ||
    pathname === "/dashboard/pricing"
  );
}

export function isDashboardBleedRoute(pathname: string): boolean {
  return (
    pathname === "/dashboard/playground" ||
    pathname === "/dashboard/chat" ||
    pathname.startsWith("/dashboard/chat/") ||
    pathname === "/dashboard/studio" ||
    pathname.startsWith("/dashboard/studio/") ||
    (pathname.startsWith("/dashboard/agents/") && pathname !== "/dashboard/agents") ||
    pathname.startsWith("/dashboard/openbot")
  );
}

export function motionDuration(seconds: number, reducedMotion: boolean | null | undefined): number {
  return reducedMotion ? 0 : seconds;
}
