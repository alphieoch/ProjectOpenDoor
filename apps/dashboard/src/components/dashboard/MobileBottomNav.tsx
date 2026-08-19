"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OchiengLogoSimple } from "@/components/logos/OchiengLogoSimple";
import {
  CHILD_HIDDEN_HREFS,
  dashboardNavGroups,
  dockItems,
  isNavActive,
} from "@/lib/dashboard-nav";
import posthog from "posthog-js";

export function MobileBottomNav({
  email,
  displayName,
  enterpriseLocked = false,
  protectedChild = false,
}: {
  email: string;
  displayName: string;
  enterpriseLocked?: boolean;
  protectedChild?: boolean;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    main: true,
    build: false,
    account: false,
    governance: false,
  });

  const groups = useMemo(
    () =>
      dashboardNavGroups.map((group) => ({
        ...group,
        items: protectedChild
          ? group.items.filter((item) => !CHILD_HIDDEN_HREFS.has(item.href))
          : group.items,
      })),
    [protectedChild],
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
          const active = isNavActive(pathname, item.href, slots);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition-transform active:scale-95 motion-reduce:transform-none",
                active ? "text-blue-500" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-2xl border",
                  active
                    ? "border-blue-500/20 bg-blue-500/10"
                    : "border-transparent bg-transparent",
                )}
              >
                <Icon className="h-5 w-5" />
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
                      const active = isNavActive(pathname, item.href, group.items);
                      return (
                        <Link
                          key={item.href}
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

              <a
                href="https://ochiengandco.com"
                target="_blank"
                rel="noreferrer"
                className="mt-6 mb-2 flex items-center gap-2 px-3 text-foreground"
              >
                <OchiengLogoSimple size={28} className="dark:invert" />
                <span className="text-xs text-muted-foreground">Ochieng & Co</span>
              </a>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
