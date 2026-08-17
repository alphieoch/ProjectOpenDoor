"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, BookOpen } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { InboxMenu } from "@/components/inbox-menu";
import { docsHref } from "@/lib/public-urls";

const CRUMBS: Record<string, [string, string]> = {
  "/dashboard": ["Workspace", "Overview"],
  "/dashboard/api-keys": ["Workspace", "API Keys"],
  "/dashboard/usage": ["Workspace", "Usage"],
  "/dashboard/pricing": ["Workspace", "Pricing"],
  "/dashboard/deployments": ["Workspace", "Deployments"],
  "/dashboard/billing": ["Workspace", "Billing"],
  "/dashboard/playground": ["Workspace", "Playground"],
  "/dashboard/workflow": ["Workspace", "Workflow"],
  "/dashboard/models": ["Workspace", "Models"],
  "/dashboard/agents": ["Workspace", "Agents"],
  "/dashboard/ai-assistants": ["Workspace", "AI Assistants"],
  "/dashboard/deployments/new": ["Workspace", "New deployment"],
  "/dashboard/team": ["Workspace", "Team"],
  "/dashboard/settings": ["Workspace", "Settings"],
  "/dashboard/audit-logs": ["Workspace", "Audit Logs"],
  "/dashboard/governance": ["Governance", "Trust Center"],
  "/dashboard/governance/policies": ["Governance", "Policies"],
  "/dashboard/governance/violations": ["Governance", "Violations"],
  "/dashboard/governance/approvals": ["Governance", "Approvals"],
  "/dashboard/governance/compliance": ["Governance", "Compliance"],
  "/dashboard/governance/sector-templates": ["Governance", "Sector Packs"],
};

export default function DashboardTopBar() {
  const pathname = usePathname();
  const crumbs =
    CRUMBS[pathname] ||
    Object.entries(CRUMBS)
      .filter(([path]) => pathname.startsWith(`${path}/`))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ||
    ["Workspace", "Dashboard"];
  const [searchOpen, setSearchOpen] = useState(false);
  const docs = docsHref("/");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="od-glass"
      style={{
        height: 60,
        borderBottom: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        gap: 16,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-3)" }}>
        <span>{crumbs[0]}</span>
        <span style={{ opacity: 0.35 }}>/</span>
        <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{crumbs[1]}</strong>
      </div>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        style={{
          flex: 1,
          maxWidth: 440,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 999,
          padding: "7px 14px",
          fontSize: 13,
          color: "var(--ink-3)",
          cursor: "pointer",
          textAlign: "left",
        }}
        className="hover:border-[var(--ink-4)]"
      >
        <Search style={{ width: 14, height: 14, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Search models, keys, pages…</span>
        <kbd
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            background: "var(--paper-2)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "1px 6px",
            color: "var(--ink-3)",
          }}
        >
          ⌘K
        </kbd>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ThemeToggle />
        <InboxMenu />
        <Link
          href={docsHref("/")}
          aria-label="Help"
          title="Help"
          style={{
            width: 34,
            height: 34,
            display: "grid",
            placeItems: "center",
            borderRadius: 999,
            color: "var(--ink-3)",
          }}
          className="hover:bg-[var(--paper-3)] hover:text-[var(--ink)]"
        >
          <BookOpen style={{ width: 16, height: 16 }} />
        </Link>
        <div style={{ width: 1, height: 20, background: "var(--line)", margin: "0 4px" }} />
        <Link
          href={docs}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 13px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid var(--line)",
            background: "var(--paper-2)",
            color: "var(--ink-2)",
            textDecoration: "none",
          }}
          className="hover:border-[var(--ink-4)] hover:-translate-y-px"
        >
          <BookOpen style={{ width: 13, height: 13 }} /> Docs
        </Link>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
