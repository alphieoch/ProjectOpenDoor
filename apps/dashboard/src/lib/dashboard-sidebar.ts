export const DASHBOARD_SIDEBAR_COLLAPSED_PX = 48;
export const DASHBOARD_SIDEBAR_EXPANDED_PX = 260;
export const DASHBOARD_SIDEBAR_HOVER_LEAVE_MS = 120;

export const DASHBOARD_SIDEBAR_COLLAPSED_CLASS = "w-12";
export const DASHBOARD_SIDEBAR_EXPANDED_CLASS = "w-[260px]";
export const DASHBOARD_SIDEBAR_CONTENT_OFFSET_CLASS = "md:ml-12";

export function isDashboardSidebarExpanded({
  hovered,
  focused,
}: {
  hovered: boolean;
  focused: boolean;
}): boolean {
  return hovered || focused;
}

export function dashboardSidebarLeaveDelay(reducedMotion: boolean): number {
  return reducedMotion ? 0 : DASHBOARD_SIDEBAR_HOVER_LEAVE_MS;
}

/** Parent + nested children as sibling icon-rail rows (OpenBot stays reachable). */
export function collapsedRailItems<T extends { children?: T[] }>(items: T[]): T[] {
  return items.flatMap((item) => [
    { ...item, children: undefined },
    ...(item.children ?? []).map((child) => ({ ...child, children: undefined })),
  ]);
}
