"use client";

import { usePathname } from "next/navigation";
import { Search, Bell, BookOpen, ExternalLink } from "lucide-react";
import Link from "next/link";

const CRUMBS: Record<string, [string, string]> = {
  "/dashboard": ["Workspace", "Overview"],
  "/dashboard/api-keys": ["Workspace", "API Keys"],
  "/dashboard/usage": ["Workspace", "Usage"],
  "/dashboard/pricing": ["Workspace", "Pricing"],
  "/dashboard/deployments": ["Workspace", "Deployments"],
  "/dashboard/billing": ["Workspace", "Billing"],
  "/dashboard/playground": ["Workspace", "Playground"],
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
  const crumbs = CRUMBS[pathname] || ["Workspace", "Dashboard"];

  return (
    <div style={{
      height: 64, borderBottom: "1px solid var(--line)",
      display: "flex", alignItems: "center", padding: "0 32px", gap: 16,
      background: "var(--paper-2)", flexShrink: 0,
    }}>
      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-3)" }}>
        <span>{crumbs[0]}</span>
        <span style={{ opacity: 0.4 }}>›</span>
        <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{crumbs[1]}</strong>
      </div>

      {/* Search */}
      <div style={{
        flex: 1, maxWidth: 420, margin: "0 auto",
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--paper)", border: "1px solid var(--line)",
        borderRadius: 8, padding: "7px 12px", fontSize: 13, color: "var(--ink-3)",
      }}>
        <Search style={{ width: 14, height: 14, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Search models, keys, policies…</span>
        <kbd style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          background: "var(--paper-2)", border: "1px solid var(--line)",
          borderRadius: 4, padding: "1px 5px", color: "var(--ink-3)",
        }}>⌘K</kbd>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 8, border: "1px solid transparent", background: "transparent", color: "var(--ink-3)", cursor: "pointer", transition: "all 0.15s" }}
          className="hover:bg-[var(--paper-3)] hover:text-[var(--ink)]">
          <Bell style={{ width: 16, height: 16 }} />
        </button>
        <button style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 8, border: "1px solid transparent", background: "transparent", color: "var(--ink-3)", cursor: "pointer", transition: "all 0.15s" }}
          className="hover:bg-[var(--paper-3)] hover:text-[var(--ink)]">
          <BookOpen style={{ width: 16, height: 16 }} />
        </button>
        <div style={{ width: 1, height: 24, background: "var(--line)" }} />
        <Link
          href="https://docs.opendoor.ai"
          target="_blank"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
            border: "1px solid var(--line)", background: "var(--paper-2)",
            color: "var(--ink-2)", textDecoration: "none", transition: "all 0.12s",
          }}
          className="hover:border-[var(--ink-4)]"
        >
          <ExternalLink style={{ width: 13, height: 13 }} /> Docs
        </Link>
      </div>
    </div>
  );
}
