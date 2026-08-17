"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MARKETING_PAGES } from "@/components/marketing-page-shell";
import { cn } from "@/lib/utils";

export function MarketingRouteReset() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

export function MarketingSubnav() {
  const pathname = usePathname();

  return (
    <div className="relative z-20 border-b border-slate-200/80 bg-white/70 backdrop-blur-md">
      <nav
        aria-label="Product pages"
        className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 py-2 lg:px-8"
      >
        {MARKETING_PAGES.map((page) => {
          const active = pathname === page.href;
          return (
            <Link
              key={page.href}
              href={page.href}
              scroll
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              {page.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
