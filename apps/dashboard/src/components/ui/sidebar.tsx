"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard, Key, BarChart3, Calculator, Server, CreditCard,
  Play, Users, Settings, ClipboardList, LogOut, ShieldCheck, Gavel,
  AlertTriangle, FileCheck, BookOpen, Building2, Bot,
  ChevronsUpDown, ChevronDown, UserPlus, UserCog, Blocks, Plus, UserCircle,
  GitBranch, List, FlaskConical, ScrollText, Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import posthog from "posthog-js";

/* ── Motion config (from template) ── */
const sidebarVariants = {
  open:   { width: "15rem" },
  closed: { width: "3.05rem" },
};

const contentVariants = {
  open:   { display: "block", opacity: 1 },
  closed: { display: "block", opacity: 1 },
};

const variants = {
  open: {
    x: 0, opacity: 1,
    transition: { x: { stiffness: 1000, velocity: -100 } },
  },
  closed: {
    x: -20, opacity: 0,
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

/* ── Nav data ── */
const navItems = [
  { href: "/dashboard", label: "Overview",   icon: LayoutDashboard },
  { href: "/dashboard/api-keys",   label: "API Keys",    icon: Key },
  { href: "/dashboard/usage",      label: "Usage",       icon: BarChart3 },
  { href: "/dashboard/logs",       label: "Logs",        icon: ScrollText },
  { href: "/dashboard/pricing",    label: "Pricing",     icon: Calculator },
  { href: "/dashboard/deployments",label: "Deployments", icon: Server, badgeKey: "deployments" as const },
  { href: "/dashboard/training",   label: "Training",    icon: FlaskConical },
  { href: "/dashboard/billing",    label: "Billing",     icon: CreditCard },
  { href: "/dashboard/playground",    label: "Playground",    icon: Play },
  { href: "/dashboard/workflow",      label: "Workflow",      icon: GitBranch },
  { href: "/dashboard/models",        label: "Models",        icon: List },
  { href: "/dashboard/agents",        label: "Agents",        icon: Sparkles, badgeKey: "agents" as const },
  { href: "/dashboard/ai-assistants", label: "AI Assistants", icon: Bot },
  { href: "/dashboard/team",          label: "Team",          icon: Users },
  { href: "/dashboard/settings",   label: "Settings",    icon: Settings },
  { href: "/dashboard/audit-logs", label: "Audit Logs",  icon: ClipboardList },
];

const governanceItems = [
  { href: "/dashboard/governance",                  label: "Trust Center", icon: ShieldCheck },
  { href: "/dashboard/governance/policies",         label: "Policies",     icon: Gavel },
  { href: "/dashboard/governance/violations",       label: "Violations",   icon: AlertTriangle, badgeKey: "openViolations" as const },
  { href: "/dashboard/governance/approvals",        label: "Approvals",    icon: FileCheck, badgeKey: "pendingApprovals" as const },
  { href: "/dashboard/governance/compliance",       label: "Compliance",   icon: BookOpen },
  { href: "/dashboard/governance/sector-templates", label: "Sector Packs", icon: Building2 },
];

function isNavActive(pathname: string | null, href: string, siblings: { href: string }[]) {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;
  return !siblings.some(
    (s) =>
      s.href !== href &&
      s.href.startsWith(`${href}/`) &&
      (pathname === s.href || pathname.startsWith(`${s.href}/`)),
  );
}

/* ── Stable NavItem (must be outside SessionNavBar so React never remounts it) ── */
function NavItem({
  item,
  layoutId,
  isCollapsed,
  active,
  animateLayout,
}: {
  item: { href: string; label: string; icon: typeof navItems[0]["icon"]; badge?: string };
  layoutId: string;
  isCollapsed: boolean;
  active: boolean;
  animateLayout: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition-colors",
        "relative",
        active ? "text-white" : "text-[var(--ink-2)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]",
      )}
    >
      {active && (
        animateLayout ? (
          <motion.div
            layoutId={layoutId}
            className="absolute inset-0 rounded-md bg-[var(--ink)]"
            style={{ zIndex: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
          />
        ) : (
          <div className="absolute inset-0 rounded-md bg-[var(--ink)]" style={{ zIndex: 0 }} />
        )
      )}
      <Icon
        className="h-4 w-4 shrink-0"
        style={{
          color: active ? "var(--brand-tint)" : "var(--ink-3)",
          position: "relative", zIndex: 1,
        }}
      />
      <motion.div variants={variants} style={{ position: "relative", zIndex: 1 }}>
        {!isCollapsed && (
          <div className="ml-2 flex items-center gap-2">
            <p className="text-sm font-medium" style={{ fontWeight: active ? 500 : 400 }}>
              {item.label}
            </p>
            {item.badge && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: active ? "var(--paper-3)" : "var(--brand)",
                  color: active ? "var(--ink)" : "white",
                }}
              >
                {item.badge}
              </span>
            )}
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

export function SessionNavBar({ email, displayName }: { email: string; displayName: string }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [openGroups, setOpenGroups] = useState({ workspace: true, governance: true });
  const [counts, setCounts] = useState({ deployments: 0, openViolations: 0, pendingApprovals: 0, agents: 0 });

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

  function withBadge<T extends { href: string; badgeKey?: keyof typeof counts }>(item: T) {
    const n = item.badgeKey ? counts[item.badgeKey] : 0;
    return { ...item, badge: n > 0 ? String(n) : undefined };
  }
  const toggleGroup = (k: "workspace" | "governance") =>
    setOpenGroups((s) => ({ ...s, [k]: !s[k] }));
  const pathname = usePathname();

  async function logout() {
    try { posthog.capture("user_logged_out"); posthog.reset(); } catch {}
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const isActive = (href: string, siblings: { href: string }[]) =>
    isNavActive(pathname, href, siblings);

  return (
    <motion.div
      className="fixed left-0 z-40 h-full shrink-0"
      style={{ borderRight: "1px solid var(--line)" }}
      initial={isCollapsed ? "closed" : "open"}
      animate={isCollapsed ? "closed" : "open"}
      variants={sidebarVariants}
      transition={transitionProps}
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
    >
      <motion.div
        className="relative z-40 flex h-full shrink-0 flex-col transition-all"
        style={{ background: "var(--paper-2)", color: "var(--ink-2)" }}
        variants={contentVariants}
      >
        <motion.div variants={staggerVariants} className="flex h-full flex-col">
          <div className="flex grow flex-col items-center">

            {/* ── Brand + org ── */}
            <div
              className="flex h-[54px] w-full shrink-0 items-center p-2"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger className="w-full" asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex w-fit items-center gap-2 px-2 hover:bg-[var(--paper-3)] hover:text-[var(--ink)]"
                  >
                    {/* Mini OpenDoor logo */}
                    <div
                      className="relative shrink-0 overflow-hidden rounded"
                      style={{ width: 18, height: 18, background: "var(--ink)", display: "grid", placeItems: "center" }}
                    >
                      <div
                        style={{
                          position: "absolute", inset: 0, background: "var(--brand)",
                          clipPath: "polygon(100% 0, 100% 100%, 55% 100%, 55% 0)",
                        }}
                      />
                      <span style={{ fontFamily: "var(--font-serif)", fontSize: 11, color: "white", position: "relative", zIndex: 1 }}>O</span>
                    </div>
                    <motion.div variants={variants} className="flex w-fit items-center gap-2">
                      {!isCollapsed && (
                        <>
                          <span className="text-sm font-medium" style={{ color: "var(--ink)", fontFamily: "var(--font-serif)" }}>
                            OpenDoor
                          </span>
                          <ChevronsUpDown className="h-4 w-4" style={{ color: "var(--ink-4)" }} />
                        </>
                      )}
                    </motion.div>
                  </Button>
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

            {/* ── Nav ── */}
            <div className="flex h-full w-full flex-col">
              <div className="flex grow flex-col">
                <ScrollArea className="h-16 grow p-2">
                  <div className="flex w-full flex-col gap-1">

                    {/* ── Workspace section ── */}
                    <motion.div variants={variants}>
                      {!isCollapsed && (
                        <button
                          type="button"
                          onClick={() => toggleGroup("workspace")}
                          className="flex w-full items-center justify-between px-2 pb-1 pt-2 transition-colors hover:text-[var(--ink)]"
                        >
                          <span
                            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                            style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}
                          >
                            Workspace
                          </span>
                          <motion.div
                            animate={{ rotate: openGroups.workspace ? 0 : -90 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                          >
                            <ChevronDown className="h-3 w-3" style={{ color: "var(--ink-4)" }} />
                          </motion.div>
                        </button>
                      )}
                    </motion.div>

                    <AnimatePresence initial={false}>
                      {(isCollapsed || openGroups.workspace) && (
                        <motion.div
                          key="workspace-items"
                          initial={isCollapsed ? false : { height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          style={{ overflow: "hidden" }}
                        >
                          <div className="flex flex-col gap-1">
                            {navItems.map((item) => (
                              <NavItem
                                key={item.href}
                                item={withBadge(item)}
                                layoutId="sidebar-active-workspace"
                                isCollapsed={isCollapsed}
                                active={isActive(item.href, navItems)}
                                animateLayout={hydrated}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <Separator className="my-1 bg-[var(--line)]" />

                    {/* ── Governance section ── */}
                    <motion.div variants={variants}>
                      {!isCollapsed && (
                        <button
                          type="button"
                          onClick={() => toggleGroup("governance")}
                          className="flex w-full items-center justify-between px-2 pb-1 pt-1 transition-colors hover:text-[var(--ink)]"
                        >
                          <span
                            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                            style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}
                          >
                            Governance
                          </span>
                          <motion.div
                            animate={{ rotate: openGroups.governance ? 0 : -90 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                          >
                            <ChevronDown className="h-3 w-3" style={{ color: "var(--ink-4)" }} />
                          </motion.div>
                        </button>
                      )}
                    </motion.div>

                    <AnimatePresence initial={false}>
                      {(isCollapsed || openGroups.governance) && (
                        <motion.div
                          key="governance-items"
                          initial={isCollapsed ? false : { height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          style={{ overflow: "hidden" }}
                        >
                          <div className="flex flex-col gap-1">
                            {governanceItems.map((item) => (
                              <NavItem
                                key={item.href}
                                item={withBadge(item)}
                                layoutId="sidebar-active-governance"
                                isCollapsed={isCollapsed}
                                active={isActive(item.href, governanceItems)}
                                animateLayout={hydrated}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>
                </ScrollArea>
              </div>

              {/* ── Bottom: invite card (expanded only) + settings + user ── */}
              <div className="flex flex-col p-2">

                {/* Invite card — only when expanded */}
                <motion.div variants={variants}>
                  {!isCollapsed && (
                    <div className="od-invite-card mb-2">
                      <h4 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink)", position: "relative" }}>
                        Invite your team
                      </h4>
                      <p style={{ margin: "4px 0 8px", fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5, position: "relative" }}>
                        New members get access to API keys, usage, and audit trails.
                      </p>
                      <Link
                        href="/dashboard/team"
                        style={{
                          position: "relative", display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "5px 12px", borderRadius: 999, background: "var(--ink)", color: "white",
                          fontSize: 11, fontWeight: 500, textDecoration: "none",
                        }}
                        className="hover:opacity-90"
                      >
                        <UserPlus style={{ width: 11, height: 11 }} /> Invite people
                      </Link>
                    </div>
                  )}
                </motion.div>

                <Link
                  href="/dashboard/settings"
                  className="flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--paper-3)] hover:text-[var(--ink)]"
                  style={{ color: "var(--ink-2)" }}
                >
                  <Settings className="h-4 w-4 shrink-0" style={{ color: "var(--ink-3)" }} />
                  <motion.div variants={variants}>
                    {!isCollapsed && <p className="ml-2 text-sm font-medium">Settings</p>}
                  </motion.div>
                </Link>

                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger className="w-full">
                    <div
                      className="flex h-8 w-full flex-row items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--paper-3)] hover:text-[var(--ink)]"
                      style={{ color: "var(--ink-2)" }}
                    >
                      <Avatar className="size-4 shrink-0">
                        <AvatarFallback className="text-[10px]" style={{ background: "var(--brand)", color: "white" }}>
                          {accountInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <motion.div variants={variants} className="flex w-full items-center gap-2">
                        {!isCollapsed && (
                          <>
                            <div className="min-w-0 flex-1 text-left">
                              <p className="truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{displayName}</p>
                              {displayName !== email && (
                                <p className="truncate text-[10px]" style={{ color: "var(--ink-4)" }}>{email}</p>
                              )}
                            </div>
                            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0" style={{ color: "var(--ink-4)" }} />
                          </>
                        )}
                      </motion.div>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent sideOffset={5}>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="flex items-center gap-2">
                      <Link href="/dashboard/settings">
                        <UserCircle className="h-4 w-4" /> Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex items-center gap-2 text-red-600 focus:text-red-600"
                      onClick={logout}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

              </div>
            </div>

          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
