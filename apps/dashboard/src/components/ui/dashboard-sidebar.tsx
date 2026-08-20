"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Settings,
  LogOut,
  UserCog,
  Blocks,
  Plus,
  Lock,
} from "lucide-react";
import posthog from "posthog-js";
import { cn } from "@/lib/utils";
import { OchiengLogoSimple } from "@/components/logos/OchiengLogoSimple";
import { ThemeToggle } from "@/components/theme-toggle";
import { InboxMenu } from "@/components/inbox-menu";
import { OpenBotSettingsDialog } from "@/components/openbot/settings-dialog";
import {
  isNavActive,
  navGroupsForViewer,
  type DashboardNavItem,
  type SidebarIcon,
} from "@/lib/dashboard-nav";
import {
  collapsedRailItems,
  DASHBOARD_SIDEBAR_COLLAPSED_CLASS,
  DASHBOARD_SIDEBAR_COLLAPSED_STATE,
  DASHBOARD_SIDEBAR_EXPANDED_CLASS,
  dashboardSidebarLeaveDelay,
  isDashboardSidebarExpanded,
  reduceDashboardSidebarExpand,
  type DashboardSidebarExpandEvent,
} from "@/lib/dashboard-sidebar";

export function useDashboardSidebarHoverExpand() {
  const pathname = usePathname();
  const [state, setState] = useState(DASHBOARD_SIDEBAR_COLLAPSED_STATE);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rootRef = useRef<HTMLElement | null>(null);
  const skipPathname = useRef(true);

  function clearLeaveTimer() {
    window.clearTimeout(leaveTimer.current);
  }

  function dispatch(event: DashboardSidebarExpandEvent) {
    setState((current) => reduceDashboardSidebarExpand(current, event));
  }

  function blurSidebarFocus() {
    const root = rootRef.current;
    const active = document.activeElement;
    if (root && active instanceof HTMLElement && root.contains(active)) {
      active.blur();
    }
  }

  function collapseAfterNavigate() {
    clearLeaveTimer();
    dispatch("navigate");
    blurSidebarFocus();
    requestAnimationFrame(blurSidebarFocus);
  }

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    if (skipPathname.current) {
      skipPathname.current = false;
      return;
    }
    collapseAfterNavigate();
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      clearLeaveTimer();
      dispatch("click-outside");
      blurSidebarFocus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return {
    expanded: isDashboardSidebarExpanded(state),
    rootRef,
    onMouseEnter() {
      clearLeaveTimer();
      dispatch("pointer-enter");
    },
    onMouseLeave() {
      clearLeaveTimer();
      leaveTimer.current = setTimeout(
        () => dispatch("pointer-leave"),
        dashboardSidebarLeaveDelay(window.matchMedia("(prefers-reduced-motion: reduce)").matches),
      );
    },
    onFocus() {
      clearLeaveTimer();
      dispatch("focus");
    },
    onBlur(event: FocusEvent<HTMLElement>) {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      dispatch("blur");
    },
    onClick(event: MouseEvent<HTMLElement>) {
      const link = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!link || !event.currentTarget.contains(link)) return;
      clearLeaveTimer();
      dispatch("click-nav");
      blurSidebarFocus();
      requestAnimationFrame(blurSidebarFocus);
    },
  };
}

export type NavItemData = {
  id: string;
  title: string;
  icon: SidebarIcon;
  href?: string;
  badge?: number | string;
  shortcut?: string;
  locked?: boolean;
  opensSettings?: boolean;
  children?: NavItemData[];
};

export type NavGroupData = {
  heading?: string;
  items: NavItemData[];
};

const SEARCH_EVENT = "opendoor:command-palette";

export function openDashboardSearch() {
  window.dispatchEvent(new Event(SEARCH_EVENT));
}

function WorkspaceSwitcher({
  workspace,
  planLabel,
  collapsed,
}: {
  workspace: string;
  planLabel: string;
  collapsed: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        title={collapsed ? `${workspace} · ${planLabel}` : undefined}
        aria-label={collapsed ? `${workspace}, ${planLabel}` : undefined}
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5",
          collapsed ? "mb-2 justify-center px-0 py-1" : "mb-4 justify-between px-2 py-2",
        )}
      >
        <div className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-3")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-primary text-[13px] font-semibold text-primary-foreground shadow-sm">
            {workspace.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col overflow-hidden">
              <span className="mb-1 max-w-[140px] truncate text-[13px] font-medium leading-none text-foreground">
                {workspace}
              </span>
              <span className="text-[11px] leading-none text-muted-foreground">{planLabel}</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground/70"
            strokeWidth={1.5}
          />
        )}
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close workspace menu"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={cn(
              "absolute z-50 flex animate-in fade-in zoom-in-95 flex-col gap-0.5 rounded-lg border border-border/50 bg-card py-1 shadow-xl duration-100",
              collapsed ? "left-full top-0 ml-1 w-56" : "left-0 top-[52px] w-full",
            )}
          >
            <Link
              href="/dashboard/team"
              onClick={() => setIsOpen(false)}
              className="mx-1 flex items-center gap-2 rounded-md px-3 py-2 text-[13px] text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <UserCog className="h-3.5 w-3.5" /> Manage team
            </Link>
            <Link
              href="/dashboard/settings"
              onClick={() => setIsOpen(false)}
              className="mx-1 flex items-center gap-2 rounded-md px-3 py-2 text-[13px] text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Blocks className="h-3.5 w-3.5" /> Settings
            </Link>
            <div className="mx-2 my-1 h-px bg-border/50" />
            <Link
              href="/get-started"
              onClick={() => setIsOpen(false)}
              className="mx-1 flex items-center gap-2 rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Plus className="h-3.5 w-3.5" /> Create workspace
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function NavItem({
  item,
  pathname,
  siblings,
  onSearch,
  onLogout,
  onOpenSettings,
  level = 0,
  collapsed = false,
}: {
  item: NavItemData;
  pathname: string | null;
  siblings: { href: string }[];
  onSearch: () => void;
  onLogout: () => void;
  onOpenSettings?: () => void;
  level?: number;
  collapsed?: boolean;
}) {
  const hasChildren = !!item.children?.length;
  const childSiblings = (item.children ?? []).flatMap((child) =>
    child.href ? [{ href: child.href }] : [],
  );
  const childActive = (item.children ?? []).some(
    (child) => child.href && isNavActive(pathname, child.href, childSiblings),
  );
  const isActive = item.href
    ? isNavActive(pathname, item.href, hasChildren ? childSiblings : siblings)
    : false;
  const [isOpen, setIsOpen] = useState(isActive || childActive);

  useEffect(() => {
    if (isActive || childActive) setIsOpen(true);
  }, [isActive, childActive]);

  const handleClick = () => {
    if (item.id === "search") {
      onSearch();
      return;
    }
    if (item.id === "logout") {
      onLogout();
      return;
    }
    if (hasChildren && !item.href) setIsOpen((v) => !v);
  };

  const Icon = item.icon;
  const iconClass = cn(
    "h-4 w-4 shrink-0 transition-colors",
    isActive ? "text-foreground" : "text-muted-foreground/70 group-hover:text-foreground/70",
  );
  const activeBar =
    "after:pointer-events-none after:absolute after:bottom-0 after:h-0.5 after:bg-foreground after:content-['']";
  const badge =
    item.badge != null && item.badge !== "" ? (
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/10 font-medium text-primary",
          collapsed
            ? "absolute -right-0.5 -top-0.5 h-3.5 min-w-3.5 px-0.5 text-[8px]"
            : "h-5 min-w-[20px] px-1.5 text-[10px]",
        )}
      >
        {item.badge}
      </span>
    ) : null;
  const inner = collapsed ? (
    <span
      className={cn(
        "relative grid size-8 place-items-center",
        isActive && cn(activeBar, "after:left-1/2 after:w-4 after:-translate-x-1/2"),
      )}
    >
      <Icon className={iconClass} />
      {badge}
      {item.locked && (
        <Lock className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-muted-foreground/70" />
      )}
    </span>
  ) : (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className={iconClass} />
        <span className="truncate text-[13px] tracking-wide">{item.title}</span>
      </div>
      <div className="flex items-center gap-2">
        {item.shortcut && (
          <kbd className="hidden h-5 items-center justify-center rounded-[4px] border border-border/50 bg-background/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/60 shadow-xs group-hover:inline-flex">
            {item.shortcut}
          </kbd>
        )}
        {badge}
        {item.locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
        {item.opensSettings && onOpenSettings ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`${item.title} settings`}
            className="grid h-5 w-5 place-items-center rounded-sm text-muted-foreground/60 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenSettings();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onOpenSettings();
              }
            }}
          >
            <Settings className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        ) : null}
        {hasChildren && (
          <span
            role="button"
            tabIndex={0}
            aria-label={isOpen ? `Hide ${item.title} categories` : `Show ${item.title} categories`}
            className="grid h-5 w-5 place-items-center rounded-sm hover:bg-black/5 dark:hover:bg-white/10"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsOpen((v) => !v);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                setIsOpen((v) => !v);
              }
            }}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 motion-reduce:transition-none",
                isOpen && "rotate-90",
              )}
              strokeWidth={2}
            />
          </span>
        )}
      </div>
    </>
  );

  const rowClass = cn(
    "group flex cursor-pointer items-center rounded-[6px] transition-all duration-200 select-none motion-reduce:transition-none",
    collapsed
      ? "justify-center px-0 py-0.5"
      : "relative justify-between px-2.5 py-[7px]",
    isActive
      ? "font-medium text-foreground"
      : "text-muted-foreground hover:bg-black/5 hover:text-foreground/90 dark:hover:bg-white/5",
    !collapsed && isActive && cn(activeBar, "after:inset-x-2.5"),
  );
  const rowStyle = collapsed ? undefined : { paddingLeft: `${level * 12 + 10}px` };

  return (
    <div className="flex w-full flex-col">
      {item.href && item.id !== "search" && item.id !== "logout" ? (
        <Link
          href={item.href}
          prefetch
          title={collapsed ? item.title : undefined}
          aria-label={collapsed ? item.title : undefined}
          className={rowClass}
          style={rowStyle}
        >
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          title={collapsed ? item.title : undefined}
          aria-label={collapsed ? item.title : undefined}
          className={cn(rowClass, "w-full", !collapsed && "text-left")}
          style={rowStyle}
          onClick={handleClick}
        >
          {inner}
        </button>
      )}

      {hasChildren && !collapsed && (
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none",
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="relative mt-0.5 flex min-h-0 flex-col gap-0.5 overflow-hidden">
            <div
              className="absolute top-0 bottom-0 border-l border-black/5 dark:border-white/5"
              style={{ left: `${level * 12 + 17.5}px` }}
            />
            {item.children!.map((child) => (
              <NavItem
                key={child.id}
                item={child}
                pathname={pathname}
                siblings={childSiblings}
                onSearch={onSearch}
                onLogout={onLogout}
                onOpenSettings={onOpenSettings}
                level={level + 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SidebarNav({
  className = "",
  email,
  displayName,
  workspaceName,
  planLabel,
  enterpriseLocked = false,
  protectedChild = false,
  isSiteAdmin = false,
  expanded = false,
}: {
  className?: string;
  email: string;
  displayName: string;
  workspaceName: string;
  planLabel: string;
  enterpriseLocked?: boolean;
  protectedChild?: boolean;
  isSiteAdmin?: boolean;
  expanded?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openBotSettingsOpen, setOpenBotSettingsOpen] = useState(false);
  const [counts, setCounts] = useState({
    deployments: 0,
    openViolations: 0,
    pendingApprovals: 0,
    agents: 0,
  });

  useEffect(() => {
    fetch("/api/nav/counts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setCounts({
          deployments: Number(data.deployments || 0),
          openViolations: Number(data.openViolations || 0),
          pendingApprovals: Number(data.pendingApprovals || 0),
          agents: Number(data.agents || 0),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        router.push("/dashboard/settings");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const groups = useMemo((): NavGroupData[] => {
    const badgeFor = (item: DashboardNavItem) => {
      const n = item.badgeKey ? counts[item.badgeKey] : 0;
      return n > 0 ? String(n) : undefined;
    };

    return navGroupsForViewer({ isSiteAdmin, protectedChild })
      .map((group) => ({
        heading: group.label,
        items: group.items
          .filter((i) => i.href !== "/dashboard/settings")
          .map((item) => ({
            id: item.href,
            title: item.label,
            icon: item.icon,
            href: item.href,
            badge: badgeFor(item),
            locked: group.id === "governance" ? enterpriseLocked : undefined,
            children: item.children?.map((child) => ({
              id: child.href,
              title: child.label,
              icon: child.icon,
              href: child.href,
              badge: badgeFor(child),
              opensSettings: child.opensSettings,
            })),
          })),
      }))
      .filter((g) => g.items.length > 0);
  }, [counts, protectedChild, enterpriseLocked, isSiteAdmin]);

  async function logout() {
    try {
      posthog.capture("user_logged_out");
      posthog.reset();
    } catch {}
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const topItems: NavItemData[] = [{ id: "search", title: "Search", icon: Search, shortcut: "⌘K" }];
  const bottomItems: NavItemData[] = [
    { id: "settings", title: "Settings", icon: Settings, href: "/dashboard/settings", shortcut: "⌘," },
    { id: "logout", title: "Log out", icon: LogOut },
  ];

  const workspace = workspaceName || displayName || email || "OpenDoor";
  const collapsed = !expanded;

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden border-r border-border/50 bg-card font-sans",
        "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
        expanded ? cn(DASHBOARD_SIDEBAR_EXPANDED_CLASS, "w-[260px]") : cn(DASHBOARD_SIDEBAR_COLLAPSED_CLASS, "w-12"),
        expanded ? "p-3 shadow-lg" : "px-1.5 py-3",
        className,
      )}
    >
      <WorkspaceSwitcher workspace={workspace} planLabel={planLabel} collapsed={collapsed} />

      <div
        className={cn(
          "mt-2 flex flex-1 flex-col overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          expanded ? "gap-4" : "items-center gap-2",
        )}
      >
        <div className={cn("flex flex-col gap-0.5", collapsed && "w-full items-center")}>
          {topItems.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              pathname={pathname}
              siblings={[]}
              onSearch={openDashboardSearch}
              onLogout={logout}
              onOpenSettings={() => setOpenBotSettingsOpen(true)}
              collapsed={collapsed}
            />
          ))}
        </div>
        {groups.map((group) => {
          const rows = expanded ? group.items : collapsedRailItems(group.items);
          const siblings = group.items.flatMap((item) => [
            ...(item.href ? [{ href: item.href }] : []),
            ...(item.children ?? []).flatMap((child) => (child.href ? [{ href: child.href }] : [])),
          ]);
          return (
            <div
              key={group.heading}
              className={cn("flex flex-col gap-0.5", collapsed && "w-full items-center")}
            >
              {group.heading &&
                (collapsed ? (
                  <div className="mx-auto my-1 h-px w-6 bg-border/50" aria-hidden />
                ) : (
                  <span className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    {group.heading}
                    {group.heading === "Governance" && enterpriseLocked && (
                      <Lock className="h-3 w-3" />
                    )}
                  </span>
                ))}
              {rows.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  siblings={siblings}
                  onSearch={openDashboardSearch}
                  onLogout={logout}
                  onOpenSettings={() => setOpenBotSettingsOpen(true)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "mt-auto flex flex-col gap-0.5 border-t border-border/50",
          expanded ? "pt-4" : "items-center pt-2",
        )}
      >
        {bottomItems.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            pathname={pathname}
            siblings={bottomItems.flatMap((i) => (i.href ? [{ href: i.href }] : []))}
            onSearch={openDashboardSearch}
            onLogout={logout}
            collapsed={collapsed}
          />
        ))}
        <div
          className={cn(
            "mt-2 flex items-center gap-1",
            collapsed ? "flex-col px-0" : "px-1",
          )}
        >
          <a
            href="https://ochiengandco.com"
            target="_blank"
            rel="noreferrer"
            title={collapsed ? "Ochieng & Co" : undefined}
            className={cn(
              "flex items-center text-foreground",
              collapsed ? "justify-center px-0 py-1" : "min-w-0 flex-1 gap-2 px-1.5 py-2",
            )}
          >
            <OchiengLogoSimple size={20} className="dark:invert" />
            {!collapsed && (
              <span className="truncate text-[11px] text-muted-foreground">Ochieng & Co</span>
            )}
          </a>
          <InboxMenu placement="right-end" />
          <ThemeToggle />
        </div>
      </div>
      <OpenBotSettingsDialog open={openBotSettingsOpen} onOpenChange={setOpenBotSettingsOpen} />
    </div>
  );
}

export default function DashboardSidebar(props: {
  email: string;
  displayName: string;
  workspaceName: string;
  planLabel: string;
  enterpriseLocked?: boolean;
  protectedChild?: boolean;
  isSiteAdmin?: boolean;
}) {
  const { expanded, rootRef, onMouseEnter, onMouseLeave, onFocus, onBlur, onClick } =
    useDashboardSidebarHoverExpand();

  return (
    <aside
      ref={rootRef}
      aria-label="Dashboard"
      aria-expanded={expanded}
      data-collapsed={expanded ? "false" : "true"}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      className={cn(
        "fixed left-0 top-0 z-40 hidden h-screen overflow-hidden md:block",
        expanded ? "w-[260px]" : "w-12",
      )}
    >
      <SidebarNav {...props} expanded={expanded} />
    </aside>
  );
}
