"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { docsHref } from "@/lib/public-urls";
import type { DocsSidebarGroup, DocsTab } from "@/lib/docs-content";

export function DocsNav({
  tabs,
  groups,
  currentHref,
  activeTab,
}: {
  tabs: DocsTab[];
  groups: DocsSidebarGroup[];
  currentHref: string;
  activeTab: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        pages: group.pages.filter((page) => page.title.toLowerCase().includes(q)),
      }))
      .filter((group) => group.pages.length > 0);
  }, [groups, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={docsHref(tab.href)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-slate-950 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-950",
              )}
            >
              {tab.title}
            </Link>
          );
        })}
      </div>

      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
        <Search className="h-4 w-4 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter this section"
          className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
        />
      </label>

      <nav className="space-y-6">
        {filtered.map((group) => (
          <div key={group.group}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {group.group}
            </p>
            <ul className="space-y-0.5">
              {group.pages.map((page) => {
                const active = page.href === currentHref;
                return (
                  <li key={page.href}>
                    <Link
                      href={docsHref(page.href)}
                      className={cn(
                        "block rounded-xl px-3 py-2 text-sm transition",
                        active
                          ? "bg-slate-950 font-medium text-white"
                          : "text-slate-600 hover:bg-white hover:text-slate-950",
                      )}
                    >
                      {page.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">No pages match that filter.</p>
        ) : null}
      </nav>
    </div>
  );
}
