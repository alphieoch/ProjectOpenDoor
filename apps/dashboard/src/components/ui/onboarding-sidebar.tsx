"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  BarChart3,
  Code2,
  ChevronsUpDown,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  UserCircle,
  UsersRound,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

/* ── Motion config (matches template exactly) ── */
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

function sidebarTransition(reduceMotion: boolean | null) {
  return {
    type: "tween" as const,
    ease: "easeOut" as const,
    duration: reduceMotion ? 0 : 0.2,
    staggerChildren: reduceMotion ? 0 : 0.1,
  };
}

const staggerVariants = {
  open: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

/* ── Props ── */
interface OnboardingSidebarProps {
  orgName: string;
  userEmail: string;
  completedSteps: number;
}

export function OnboardingSidebar({ orgName, userEmail, completedSteps }: OnboardingSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const orgInitial = orgName.charAt(0).toUpperCase();
  const userInitial = userEmail.split("@")[0].charAt(0).toUpperCase();

  return (
    <motion.div
      className="fixed left-0 z-40 h-full shrink-0 border-r border-border"
      initial={isCollapsed ? "closed" : "open"}
      animate={isCollapsed ? "closed" : "open"}
      variants={sidebarVariants}
      transition={sidebarTransition(reduceMotion)}
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
    >
      <motion.div
        className="relative z-40 flex h-full shrink-0 flex-col bg-background text-muted-foreground transition-all"
        variants={contentVariants}
      >
        <motion.ul variants={staggerVariants} className="flex h-full flex-col">
          <div className="flex grow flex-col items-center">

            {/* ── Org header ── */}
            <div className="flex h-[54px] w-full shrink-0 border-b border-border p-2">
              <div className="mt-[1.5px] flex w-full">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger className="w-full" asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${orgName} workspace menu`}
                      className="flex w-fit items-center gap-2 px-2 hover:bg-accent hover:text-foreground"
                    >
                      <Avatar className="size-4 rounded">
                        <AvatarFallback className="text-[10px] bg-primary text-primary-foreground rounded">
                          {orgInitial}
                        </AvatarFallback>
                      </Avatar>
                      <motion.li variants={variants} className="flex w-fit items-center gap-2">
                        {!isCollapsed && (
                          <>
                            <p className="text-sm font-medium text-slate-900">{orgName}</p>
                            <ChevronsUpDown className="h-4 w-4 text-slate-400" />
                          </>
                        )}
                      </motion.li>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-white text-slate-900">
                    <DropdownMenuItem asChild className="flex items-center gap-2">
                      <Link href="/dashboard/team">
                        <UsersRound className="h-4 w-4" /> Manage team
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="flex items-center gap-2">
                      <Link href="/dashboard/settings">
                        <Settings className="h-4 w-4" /> Settings
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* ── Nav ── */}
            <div className="flex h-full w-full flex-col">
              <div className="flex grow flex-col gap-4">
                <ScrollArea className="h-16 grow p-2">
                  <div className={cn("flex w-full flex-col gap-1")}>

                    <Link
                      href="/dashboard"
                      title="Dashboard"
                      aria-label="Dashboard"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-accent hover:text-foreground",
                        pathname?.includes("/dashboard") && !pathname?.includes("/dashboard/") && "bg-muted text-foreground",
                      )}
                    >
                      <LayoutDashboard className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && <p className="ml-2 text-sm font-medium">Dashboard</p>}
                      </motion.li>
                    </Link>

                    <Link
                      href="/dashboard/api-keys"
                      title="API Keys"
                      aria-label="API Keys"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-accent hover:text-foreground",
                        pathname?.includes("api-keys") && "bg-muted text-foreground",
                      )}
                    >
                      <KeyRound className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && <p className="ml-2 text-sm font-medium">API Keys</p>}
                      </motion.li>
                    </Link>

                    <Link
                      href="/dashboard/usage"
                      title="Usage"
                      aria-label="Usage"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-accent hover:text-foreground",
                        pathname?.includes("usage") && "bg-muted text-foreground",
                      )}
                    >
                      <BarChart3 className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && <p className="ml-2 text-sm font-medium">Usage</p>}
                      </motion.li>
                    </Link>

                    <Link
                      href="/dashboard/playground"
                      title="Playground"
                      aria-label="Playground"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-accent hover:text-foreground",
                        pathname?.includes("playground") && "bg-muted text-foreground",
                      )}
                    >
                      <Code2 className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && <p className="ml-2 text-sm font-medium">Playground</p>}
                      </motion.li>
                    </Link>

                    <Separator className="w-full bg-slate-200" />

                    <Link
                      href="/dashboard/governance"
                      title="Governance"
                      aria-label="Governance"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-accent hover:text-foreground",
                        pathname?.includes("governance") && "bg-muted text-foreground",
                      )}
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && (
                          <div className="ml-2 flex items-center gap-2">
                            <p className="text-sm font-medium">Governance</p>
                            <Badge className="flex h-fit w-fit items-center rounded-full border-none bg-blue-100 px-1.5 text-blue-700" variant="outline">
                              NEW
                            </Badge>
                          </div>
                        )}
                      </motion.li>
                    </Link>

                    <Link
                      href="/dashboard/billing"
                      title="Billing"
                      aria-label="Billing"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-accent hover:text-foreground",
                        pathname?.includes("billing") && "bg-muted text-foreground",
                      )}
                    >
                      <CreditCard className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && <p className="ml-2 text-sm font-medium">Billing</p>}
                      </motion.li>
                    </Link>

                    <Separator className="w-full bg-slate-200" />

                    <Link
                      href="/status"
                      title="Status"
                      aria-label="Status"
                      className="flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-accent hover:text-foreground"
                    >
                      <Activity className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && <p className="ml-2 text-sm font-medium">Status</p>}
                      </motion.li>
                    </Link>

                  </div>
                </ScrollArea>
              </div>

              {/* ── Bottom: settings + user ── */}
              <div className="flex flex-col p-2">
                <Link
                  href="/dashboard/settings"
                  title="Settings"
                  aria-label="Settings"
                  className="flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-accent hover:text-foreground"
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  <motion.li variants={variants}>
                    {!isCollapsed && <p className="ml-2 text-sm font-medium">Settings</p>}
                  </motion.li>
                </Link>

                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger className="w-full">
                    <div className="flex h-8 w-full flex-row items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-accent hover:text-foreground">
                      <Avatar className="size-4">
                        <AvatarFallback className="text-[10px] bg-slate-200 text-slate-700">
                          {userInitial}
                        </AvatarFallback>
                      </Avatar>
                      <motion.li variants={variants} className="flex w-full items-center gap-2">
                        {!isCollapsed && (
                          <>
                            <p className="text-sm font-medium text-slate-900 truncate max-w-[120px]">{userEmail}</p>
                            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
                          </>
                        )}
                      </motion.li>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent sideOffset={5} className="bg-white text-slate-900">
                    <div className="flex flex-row items-center gap-2 p-2">
                      <Avatar className="size-6">
                        <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">
                          {userInitial}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col text-left">
                        <span className="line-clamp-1 text-xs text-slate-500">{userEmail}</span>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="flex items-center gap-2">
                      <Link href="/dashboard/settings">
                        <UserCircle className="h-4 w-4" /> Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex items-center gap-2"
                      onSelect={(event) => {
                        event.preventDefault();
                        void logout();
                      }}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Setup progress indicator */}
                {!isCollapsed && (
                  <div className="mt-2 rounded-lg border border-border bg-slate-50 px-3 py-2">
                    <p className="text-xs font-medium text-slate-600">Setup progress</p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min((completedSteps / 3) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{completedSteps} of 3 complete</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </motion.ul>
      </motion.div>
    </motion.div>
  );
}
