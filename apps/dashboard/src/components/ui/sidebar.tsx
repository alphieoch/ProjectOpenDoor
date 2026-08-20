"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LogOut, ChevronsUpDown, ChevronDown, UserPlus, UserCog, Blocks, Plus, UserCircle, Lock,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import posthog from "posthog-js";
import {
  isNavActive,
  navGroupsForViewer,
  type DashboardNavItem,
} from "@/lib/dashboard-nav";
import { OchiengLogoSimple } from "@/components/logos/OchiengLogoSimple";

const sidebarVariants = {
  open: { width: "15rem" },
  closed: { width: "4rem" },
};

const contentVariants = {
  open: { display: "block", opacity: 1 },
  closed: { display: "block", opacity: 1 },
};

const variants = {
  open: {
    x: 0,
    opacity: 1,
    transition: { x: { stiffness: 1000, velocity: -100 } },
  },
  closed: {
    x: -20,
    opacity: 0,
    transition: { x: { stiffness: 100 } },
  },
};

const transitionProps = {
  type: "tween",
  ease: "easeOut",
  duration: 0.2,
  staggerChildren: 0.1,
} as const;

const staggerVariants = {
  open: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

function NavItem({
  item,
  layoutId,
  isCollapsed,
  active,
  animateLayout,
}: {
  item: DashboardNavItem & { badge?: string; locked?: boolean };
  layoutId: string;
  isCollapsed: boolean;
  active: boolean;
  animateLayout: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={true}
      className={cn(
        "relative flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {active &&
        (animateLayout ? (
          <motion.div
            layoutId={layoutId}
            className="absolute inset-0 z-0 rounded-md bg-primary"
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
          />
        ) : (
          <div className="absolute inset-0 z-0 rounded-md bg-primary" />
        ))}
      <Icon
        className={cn("relative z-[1] h-4 w-4 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")}
      />
      <motion.div variants={variants} className="relative z-[1]">
        {!isCollapsed && (
          <div className="ml-2 flex items-center gap-2">
            <p className={cn("text-sm", active ? "font-medium text-primary-foreground" : "font-normal")}>
              {item.label}
            </p>
            {item.badge && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground",
                )}
              >
                {item.badge}
              </span>
            )}
            {item.locked && <Lock className="h-3 w-3 shrink-0 opacity-70" />}
          </div>
        )}
      </motion.div>
    </Link>
  );
}

function accountInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "OD";
}

export function SessionNavBar({
  email,
  displayName,
  enterpriseLocked = false,
  protectedChild = false,
  isSiteAdmin = false,
}: {
  email: string;
  displayName: string;
  enterpriseLocked?: boolean;
  protectedChild?: boolean;
  isSiteAdmin?: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [openGroups, setOpenGroups] = useState({
    main: true,
    build: true,
    account: true,
    governance: true,
    admin: true,
  });
  const [counts, setCounts] = useState({
    deployments: 0,
    openViolations: 0,
    pendingApprovals: 0,
    agents: 0,
  });
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();

  const groups = useMemo(
    () => navGroupsForViewer({ isSiteAdmin, protectedChild }),
    [isSiteAdmin, protectedChild],
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

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

  function withBadge(item: DashboardNavItem) {
    const n = item.badgeKey ? counts[item.badgeKey] : 0;
    return { ...item, badge: n > 0 ? String(n) : undefined };
  }

  async function logout() {
    try {
      posthog.capture("user_logged_out");
      posthog.reset();
    } catch {}
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const animateLayout = hydrated && !reduceMotion;

  return (
    <motion.div
      className="fixed left-0 z-40 h-full shrink-0 border-r border-border bg-background text-muted-foreground"
      initial={isCollapsed ? "closed" : "open"}
      animate={isCollapsed ? "closed" : "open"}
      variants={sidebarVariants}
      transition={reduceMotion ? { duration: 0 } : transitionProps}
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
    >
      <motion.div className="relative z-40 flex h-full shrink-0 flex-col bg-background" variants={contentVariants}>
        <motion.div variants={staggerVariants} className="flex h-full flex-col">
          <div className="flex grow flex-col items-center">
            <div className="flex h-[54px] w-full shrink-0 items-center border-b border-border p-2">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "flex w-fit items-center gap-2 px-2",
                    )}
                  >
                    <div className="relative grid size-[18px] shrink-0 place-items-center overflow-hidden rounded bg-primary">
                      <span className="relative z-[1] font-garamond text-[11px] text-primary-foreground">O</span>
                    </div>
                    <motion.div variants={variants} className="flex w-fit items-center gap-2">
                      {!isCollapsed && (
                        <>
                          <span className="text-sm font-medium text-foreground">OpenDoor</span>
                          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                        </>
                      )}
                    </motion.div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem asChild className="flex items-center gap-2">
                    <Link href="/dashboard/team">
                      <UserCog className="h-4 w-4" /> Manage team
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="flex items-center gap-2">
                    <Link href="/dashboard/settings">
                      <Blocks className="h-4 w-4" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="flex items-center gap-2">
                    <Link href="/get-started" className="flex items-center gap-2">
                      <Plus className="h-4 w-4" /> New workspace
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex h-full w-full flex-col">
              <div className="flex grow flex-col">
                <ScrollArea className="h-16 grow p-2">
                  <div className="flex w-full flex-col gap-1">
                    {groups.map((group) => (
                      <div key={group.id}>
                        <motion.div variants={variants}>
                          {!isCollapsed && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenGroups((s) => ({ ...s, [group.id]: !s[group.id] }))
                              }
                              className="flex w-full items-center justify-between px-2 pb-1 pt-2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                                {group.label}
                                {group.id === "governance" && enterpriseLocked && (
                                  <Lock className="h-3 w-3" />
                                )}
                              </span>
                              <motion.div
                                animate={{ rotate: openGroups[group.id] ? 0 : -90 }}
                                transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                              >
                                <ChevronDown className="h-3 w-3" />
                              </motion.div>
                            </button>
                          )}
                        </motion.div>

                        <AnimatePresence initial={false}>
                          {(isCollapsed || openGroups[group.id]) && (
                            <motion.div
                              key={`${group.id}-items`}
                              initial={isCollapsed || reduceMotion ? false : { height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                              transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="flex flex-col gap-1">
                                {group.items.map((item) => (
                                  <NavItem
                                    key={item.href}
                                    item={{
                                      ...withBadge(item),
                                      locked: group.id === "governance" ? enterpriseLocked : undefined,
                                    }}
                                    layoutId={`sidebar-active-${group.id}`}
                                    isCollapsed={isCollapsed}
                                    active={isNavActive(pathname, item.href, group.items)}
                                    animateLayout={animateLayout}
                                  />
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col gap-2 p-2">
                <motion.div variants={variants}>
                  {!isCollapsed && (
                    <div className="mb-1 rounded-lg border border-border bg-muted/40 p-3">
                      <h4 className="text-xs font-semibold text-foreground">Invite your team</h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        New members get access to API keys, usage, and audit trails.
                      </p>
                      <Link
                        href="/dashboard/team"
                        className={cn(
                          buttonVariants({ size: "sm" }),
                          "mt-2 h-7 rounded-full px-3 text-[11px]",
                        )}
                      >
                        <UserPlus className="h-3 w-3" /> Invite people
                      </Link>
                    </div>
                  )}
                </motion.div>

                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-8 w-full flex-row items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <span className="relative shrink-0">
                        <span className="grid size-5 place-items-center rounded-full bg-muted text-[9px] font-semibold text-foreground">
                          {accountInitials(displayName)}
                        </span>
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-background",
                            isSiteAdmin ? "bg-violet-500" : "bg-emerald-500",
                          )}
                        />
                      </span>
                      <motion.div variants={variants} className="flex w-full items-center gap-2">
                        {!isCollapsed && (
                          <>
                            <div className="min-w-0 flex-1 text-left">
                              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                              {displayName !== email && (
                                <p className="truncate text-[10px] text-muted-foreground">{email}</p>
                              )}
                            </div>
                            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                          </>
                        )}
                      </motion.div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent sideOffset={5}>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="flex items-center gap-2">
                      <Link href="/dashboard/settings">
                        <UserCircle className="h-4 w-4" /> Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="flex items-center gap-2 text-red-600 focus:text-red-600" onClick={logout}>
                      <LogOut className="h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <a
                  href="https://ochiengandco.com"
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "flex items-center justify-center rounded-md p-1 text-foreground",
                    isCollapsed ? "mx-auto" : "justify-start gap-2 px-2",
                  )}
                  aria-label="Ochieng & Co"
                >
                  <OchiengLogoSimple size={isCollapsed ? 18 : 22} className="dark:invert" />
                  {!isCollapsed && (
                    <span className="text-[10px] font-medium text-muted-foreground">Ochieng & Co</span>
                  )}
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
