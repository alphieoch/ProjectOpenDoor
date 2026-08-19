"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  CHILD_HIDDEN_HREFS,
  dashboardNavGroups,
  isNavActive,
  type DashboardNavItem,
  type SidebarIcon,
} from "@/lib/dashboard-nav";

export type NavItemData = {
  id: string;
  title: string;
  icon: SidebarIcon;
  href?: string;
  badge?: number | string;
  shortcut?: string;
  locked?: boolean;
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
}: {
  workspace: string;
  planLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="group mb-4 flex w-full items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-primary text-[13px] font-semibold text-primary-foreground shadow-sm">
            {workspace.charAt(0).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col overflow-hidden">
            <span className="mb-1 max-w-[140px] truncate text-[13px] font-medium leading-none text-foreground">
              {workspace}
            </span>
            <span className="text-[11px] leading-none text-muted-foreground">{planLabel}</span>
          </div>
        </div>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground/70"
          strokeWidth={1.5}
        />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close workspace menu"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-[52px] z-50 flex w-full animate-in fade-in zoom-in-95 flex-col gap-0.5 rounded-lg border border-border/50 bg-card py-1 shadow-xl duration-100">
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
  level = 0,
}: {
  item: NavItemData;
  pathname: string | null;
  siblings: { href: string }[];
  onSearch: () => void;
  onLogout: () => void;
  level?: number;
}) {
  const hasChildren = !!item.children?.length;
  const [isOpen, setIsOpen] = useState(false);
  const childSiblings = (item.children ?? []).flatMap((child) =>
    child.href ? [{ href: child.href }] : [],
  );
  const isActive = item.href
    ? isNavActive(pathname, item.href, hasChildren ? childSiblings : siblings)
    : false;

  const handleClick = () => {
    if (item.id === "search") {
      onSearch();
      return;
    }
    if (item.id === "logout") {
      onLogout();
      return;
    }
    if (hasChildren) setIsOpen((v) => !v);
  };

  const Icon = item.icon;
  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isActive ? "text-foreground" : "text-muted-foreground/70 group-hover:text-foreground/70",
          )}
        />
        <span className="truncate text-[13px] tracking-wide">{item.title}</span>
      </div>
      <div className="flex items-center gap-2">
        {item.shortcut && (
          <kbd className="hidden h-5 items-center justify-center rounded-[4px] border border-border/50 bg-background/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/60 shadow-xs group-hover:inline-flex">
            {item.shortcut}
          </kbd>
        )}
        {item.badge != null && item.badge !== "" && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
            {item.badge}
          </span>
        )}
        {item.locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
        {hasChildren && (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 motion-reduce:transition-none",
              isOpen && "rotate-90",
            )}
            strokeWidth={2}
          />
        )}
      </div>
    </>
  );

  const rowClass = cn(
    "group flex cursor-pointer items-center justify-between rounded-[6px] px-2.5 py-[7px] transition-all duration-200 select-none motion-reduce:transition-none",
    isActive
      ? "bg-black/5 font-medium text-foreground dark:bg-white/10"
      : "text-muted-foreground hover:bg-black/5 hover:text-foreground/90 dark:hover:bg-white/5",
  );

  return (
    <div className="flex w-full flex-col">
      {item.href && !hasChildren && item.id !== "search" && item.id !== "logout" ? (
        <Link href={item.href} prefetch className={rowClass} style={{ paddingLeft: `${level * 12 + 10}px` }}>
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          className={cn(rowClass, "w-full text-left")}
          style={{ paddingLeft: `${level * 12 + 10}px` }}
          onClick={handleClick}
        >
          {inner}
        </button>
      )}

      {hasChildren && (
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
}: {
  className?: string;
  email: string;
  displayName: string;
  workspaceName: string;
  planLabel: string;
  enterpriseLocked?: boolean;
  protectedChild?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
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

    return dashboardNavGroups
      .map((group) => ({
        heading: group.label,
        items: (protectedChild ? group.items.filter((i) => !CHILD_HIDDEN_HREFS.has(i.href)) : group.items)
          .filter((i) => i.href !== "/dashboard/settings")
          .map((item) => ({
            id: item.href,
            title: item.label,
            icon: item.icon,
            href: item.href,
            badge: badgeFor(item),
            locked: group.id === "governance" ? enterpriseLocked : undefined,
          })),
      }))
      .filter((g) => g.items.length > 0);
  }, [counts, protectedChild, enterpriseLocked]);

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

  return (
    <div
      className={cn(
        "flex h-full w-[260px] flex-col border-r border-border/50 bg-card/50 p-3 font-sans",
        className,
      )}
    >
      <WorkspaceSwitcher workspace={workspace} planLabel={planLabel} />

      <div className="mt-2 flex flex-1 flex-col gap-4 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-col gap-0.5">
          {topItems.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              pathname={pathname}
              siblings={[]}
              onSearch={openDashboardSearch}
              onLogout={logout}
            />
          ))}
        </div>
        {groups.map((group) => {
          const siblings = group.items.flatMap((item) => (item.href ? [{ href: item.href }] : []));
          return (
            <div key={group.heading} className="flex flex-col gap-0.5">
              {group.heading && (
                <span className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {group.heading}
                  {group.heading === "Governance" && enterpriseLocked && (
                    <Lock className="h-3 w-3" />
                  )}
                </span>
              )}
              {group.items.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  siblings={siblings}
                  onSearch={openDashboardSearch}
                  onLogout={logout}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-border/50 pt-4">
        {bottomItems.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            pathname={pathname}
            siblings={bottomItems.flatMap((i) => (i.href ? [{ href: i.href }] : []))}
            onSearch={openDashboardSearch}
            onLogout={logout}
          />
        ))}
        <a
          href="https://ochiengandco.com"
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center gap-2 px-2.5 py-2 text-foreground"
        >
          <OchiengLogoSimple size={20} className="dark:invert" />
          <span className="text-[11px] text-muted-foreground">Ochieng & Co</span>
        </a>
      </div>
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
}) {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen md:block">
      <SidebarNav {...props} />
    </aside>
  );
}
