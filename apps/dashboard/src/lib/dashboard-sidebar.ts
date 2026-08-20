export const DASHBOARD_SIDEBAR_COLLAPSED_PX = 48;
export const DASHBOARD_SIDEBAR_EXPANDED_PX = 260;
export const DASHBOARD_SIDEBAR_HOVER_LEAVE_MS = 120;

export const DASHBOARD_SIDEBAR_COLLAPSED_CLASS = "w-12";
export const DASHBOARD_SIDEBAR_EXPANDED_CLASS = "w-[260px]";
export const DASHBOARD_SIDEBAR_CONTENT_OFFSET_CLASS = "md:ml-12";

export type DashboardSidebarExpandState = {
  hovered: boolean;
  focused: boolean;
  holdCollapse: boolean;
};

export const DASHBOARD_SIDEBAR_COLLAPSED_STATE: DashboardSidebarExpandState = {
  hovered: false,
  focused: false,
  holdCollapse: false,
};

export type DashboardSidebarExpandEvent =
  | "pointer-enter"
  | "pointer-leave"
  | "focus"
  | "blur"
  | "navigate"
  | "click-nav"
  | "click-outside";

export function isDashboardSidebarExpanded({
  hovered,
  focused,
  holdCollapse = false,
}: {
  hovered: boolean;
  focused: boolean;
  holdCollapse?: boolean;
}): boolean {
  if (holdCollapse) return false;
  return hovered || focused;
}

export function reduceDashboardSidebarExpand(
  state: DashboardSidebarExpandState,
  event: DashboardSidebarExpandEvent,
): DashboardSidebarExpandState {
  switch (event) {
    case "pointer-enter":
      return { hovered: true, focused: state.focused, holdCollapse: false };
    case "pointer-leave":
      return { hovered: false, focused: false, holdCollapse: false };
    case "focus":
      if (state.holdCollapse) return state;
      return { ...state, focused: true };
    case "blur":
      return { ...state, focused: false };
    case "navigate":
    case "click-nav":
    case "click-outside":
      return { hovered: false, focused: false, holdCollapse: true };
    default:
      return state;
  }
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
