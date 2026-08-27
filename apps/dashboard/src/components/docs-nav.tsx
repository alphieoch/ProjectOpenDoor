"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { docsHref } from "@/lib/public-urls";
import type { DocsPageLink, DocsSidebarGroup, DocsTab } from "@/lib/docs-content";

export function DocsNav({
  tabs,
  groups,
  pinned,
  currentHref,
  activeTab,
}: {
  tabs: DocsTab[];
  groups: DocsSidebarGroup[];
  pinned?: DocsPageLink[];
  currentHref: string;
  activeTab: string;
}) {
  const [query, setQuery] = useState("");
  const filteredPinned = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = pinned ?? [];
    if (!q) return rows;
    return rows.filter((page) => page.title.toLowerCase().includes(q));
  }, [pinned, query]);
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
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground ring-1 ring-border hover:bg-accent hover:text-foreground",
              )}
            >
              {tab.title}
            </Link>
          );
        })}
      </div>

      <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        <Search className="h-4 w-4 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter this section"
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      <nav className="space-y-6">
        {filteredPinned.length > 0 ? (
          <NavGroup title="Use the API" pages={filteredPinned} currentHref={currentHref} />
        ) : null}
        {filtered.map((group) => (
          <NavGroup
            key={group.group}
            title={group.group}
            pages={group.pages}
            currentHref={currentHref}
          />
        ))}
        {filteredPinned.length === 0 && filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pages match that filter.</p>
        ) : null}
      </nav>
    </div>
  );
}

function NavGroup({
  title,
  pages,
  currentHref,
}: {
  title: string;
  pages: DocsPageLink[];
  currentHref: string;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-0.5">
        {pages.map((page) => {
          const active = page.href === currentHref;
          return (
            <li key={`${title}:${page.href}`}>
              <Link
                href={docsHref(page.href)}
                className={cn(
                  "block rounded-xl px-3 py-2 text-sm transition",
                  active
                    ? "bg-foreground font-medium text-background"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                {page.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
