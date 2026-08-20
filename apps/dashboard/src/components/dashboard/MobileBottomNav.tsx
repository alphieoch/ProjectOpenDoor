"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OchiengLogoSimple } from "@/components/logos/OchiengLogoSimple";
import { InboxMenu } from "@/components/inbox-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CHILD_HIDDEN_HREFS,
  dockItems,
  isNavActive,
  navGroupsForViewer,
} from "@/lib/dashboard-nav";
import posthog from "posthog-js";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/page-motion";

export function MobileBottomNav({
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
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    main: true,
    build: false,
    account: false,
    governance: false,
    admin: false,
  });

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const groups = useMemo(
    () =>
      navGroupsForViewer({
        isSiteAdmin,
        protectedChild,
        hasEnterpriseTools: !enterpriseLocked,
      }),
    [isSiteAdmin, protectedChild, enterpriseLocked],
  );

  const slots = protectedChild
    ? dockItems.filter((item) => !CHILD_HIDDEN_HREFS.has(item.href))
    : dockItems;

  async function logout() {
    try {
      posthog.capture("user_logged_out");
      posthog.reset();
    } catch {}
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 md:hidden">
      <LayoutGroup id="mobile-dock">
      <nav
        className="pointer-events-auto mx-auto flex h-[72px] max-w-[520px] items-stretch justify-around rounded-[32px] border border-white/40 bg-white/80 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80"
        style={{
          marginLeft: 32,
          marginRight: 32,
          marginBottom: "calc(32px + env(safe-area-inset-bottom, 0px))",
        }}
        aria-label="Primary"
      >
        {slots.map((item) => {
          const Icon = item.icon;
          const active =
            (item.href === "/dashboard/agents" &&
              (pathname?.startsWith("/dashboard/openbot") || pathname?.startsWith("/dashboard/ai-assistants"))) ||
            isNavActive(pathname, item.href, slots);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setSheetOpen(false)}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition-transform active:scale-95 motion-reduce:transform-none",
                active ? "text-blue-500" : "text-muted-foreground",
              )}
            >
              <span className="relative grid size-9 place-items-center rounded-2xl">
                {active ? (
                  <motion.span
                    layoutId="mobile-dock-active"
                    className="absolute inset-0 rounded-2xl border border-blue-500/20 bg-blue-500/10"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: MOTION_DURATION.layout, ease: MOTION_EASE }
                    }
                  />
                ) : null}
                <Icon className="relative h-5 w-5" />
              </span>
              <span className="truncate text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-muted-foreground transition-transform active:scale-95 motion-reduce:transform-none"
            aria-label="Menu"
          >
            <span className="grid size-9 place-items-center rounded-2xl">
              <Menu className="h-5 w-5" />
            </span>
            <span className="text-[10px] font-medium leading-none">Menu</span>
          </button>
          <SheetContent className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
            <SheetHeader className="px-0">
              <SheetTitle className="flex items-center gap-2 text-left">
                Menu
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                {displayName}
                {displayName !== email ? ` · ${email}` : ""}
              </p>
            </SheetHeader>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {groups.map((group) => (
                <div key={group.id} className="mb-2">
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => ({ ...s, [group.id]: !s[group.id] }))}
                    className="flex min-h-11 w-full items-center justify-between px-1 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    {group.label}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform motion-reduce:transition-none",
                        expanded[group.id] && "rotate-180",
                      )}
                    />
                  </button>
                  <div className={cn("overflow-hidden", expanded[group.id] ? "max-h-[32rem]" : "max-h-0")}>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const childHrefs = (item.children ?? []).map((child) => ({ href: child.href }));
                      const active = isNavActive(
                        pathname,
                        item.href,
                        item.children?.length ? childHrefs : group.items,
                      );
                      return (
                        <div key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setSheetOpen(false)}
                            className={cn(
                              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-[15px]",
                              active
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                            <span>{item.label}</span>
                            {group.id === "governance" && enterpriseLocked && (
                              <span className="ml-auto text-[10px] uppercase tracking-wide">Locked</span>
                            )}
                          </Link>
                          {item.children?.map((child) => {
                            const ChildIcon = child.icon;
                            const childActive = isNavActive(pathname, child.href, childHrefs);
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => setSheetOpen(false)}
                                className={cn(
                                  "ml-6 flex min-h-10 items-center gap-3 rounded-lg px-3 py-1.5 text-[14px]",
                                  childActive
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                )}
                              >
                                <ChildIcon className="h-4 w-4" />
                                <span>{child.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={logout}
                className="mt-4 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium"
                style={{ color: "#FF3B30" }}
              >
                <LogOut className="h-[18px] w-[18px]" />
                Log Out
              </button>
            </div>
            <div className="mt-auto flex items-center gap-1 border-t border-border/50 px-1 pt-3">
              <a
                href="https://ochiengandco.com"
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-foreground"
              >
                <OchiengLogoSimple size={28} className="dark:invert" />
                <span className="text-xs text-muted-foreground">Ochieng & Co</span>
              </a>
              <InboxMenu placement="top-end" />
              <ThemeToggle />
            </div>
          </SheetContent>
        </Sheet>
      </nav>
      </LayoutGroup>
    </div>
  );
}
