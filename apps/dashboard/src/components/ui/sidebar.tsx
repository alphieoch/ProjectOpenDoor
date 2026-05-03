"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Key, BarChart3, Calculator, Server, CreditCard,
  Play, Users, Settings, ClipboardList, LogOut, ShieldCheck, Gavel,
  AlertTriangle, FileCheck, BookOpen, Building2, ChevronDown, ChevronRight,
  Bell, UserPlus, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import posthog from "posthog-js";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/api-keys", label: "API Keys", icon: Key },
  { href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
  { href: "/dashboard/pricing", label: "Pricing", icon: Calculator },
  { href: "/dashboard/deployments", label: "Deployments", icon: Server, badge: "5" },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/playground", label: "Playground", icon: Play },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/audit-logs", label: "Audit Logs", icon: ClipboardList },
];

const governanceItems = [
  { href: "/dashboard/governance", label: "Trust Center", icon: ShieldCheck },
  { href: "/dashboard/governance/policies", label: "Policies", icon: Gavel },
  { href: "/dashboard/governance/violations", label: "Violations", icon: AlertTriangle, badge: "3" },
  { href: "/dashboard/governance/approvals", label: "Approvals", icon: FileCheck },
  { href: "/dashboard/governance/compliance", label: "Compliance", icon: BookOpen },
  { href: "/dashboard/governance/sector-templates", label: "Sector Packs", icon: Building2 },
];

export function SessionNavBar() {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState({ workspace: true, governance: true });
  const toggleGroup = (k: "workspace" | "governance") =>
    setOpenGroups((s) => ({ ...s, [k]: !s[k] }));

  async function logout() {
    try { posthog.capture("user_logged_out"); posthog.reset(); } catch {}
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    return pathname?.startsWith(href);
  };

  const NavItem = ({ item }: { item: typeof navItems[0] }) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "7px 10px", borderRadius: 7,
          color: active ? "white" : "var(--ink-2)",
          background: active ? "var(--ink)" : "transparent",
          fontWeight: active ? 500 : 400,
          fontSize: 13.5, textDecoration: "none",
          transition: "background 0.12s, color 0.12s",
          position: "relative",
        }}
        className={cn(!active && "hover:bg-[var(--paper-3)] hover:text-[var(--ink)]")}
      >
        <Icon style={{ width: 15, height: 15, flexShrink: 0, color: active ? "var(--brand-tint)" : "var(--ink-3)" }} />
        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
        {item.badge && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            background: active ? "var(--paper-3)" : "var(--brand)",
            color: active ? "var(--ink)" : "white",
            padding: "1px 6px", borderRadius: 999, fontWeight: 500,
          }}>{item.badge}</span>
        )}
      </Link>
    );
  };

  const GroupHeader = ({ id, title }: { id: "workspace" | "governance"; title: string }) => (
    <button
      onClick={() => toggleGroup(id)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: "7px 12px 5px", background: "none", border: "none",
        cursor: "pointer",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-4)", fontWeight: 500 }}>{title}</span>
      {openGroups[id]
        ? <ChevronDown style={{ width: 12, height: 12, color: "var(--ink-4)" }} />
        : <ChevronRight style={{ width: 12, height: 12, color: "var(--ink-4)" }} />}
    </button>
  );

  return (
    <aside
      style={{
        width: 248, flexShrink: 0, background: "var(--paper-2)",
        borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column",
        height: "100vh", position: "fixed", left: 0, top: 0, zIndex: 40, overflow: "hidden",
      }}
    >
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 16px", borderBottom: "1px solid var(--line)", height: 64 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: "var(--ink)",
          display: "grid", placeItems: "center", flexShrink: 0,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, background: "var(--brand)",
            clipPath: "polygon(100% 0, 100% 100%, 60% 100%, 60% 0)",
          }} />
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, color: "white", position: "relative", zIndex: 1 }}>O</span>
        </div>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 19, letterSpacing: "-0.01em", color: "var(--ink)" }}>OpenDoor</span>
      </div>

      {/* Org chip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 14px", margin: "12px 12px 4px",
        border: "1px solid var(--line)", borderRadius: 8,
        background: "var(--paper-2)", cursor: "pointer",
        transition: "background 0.15s",
      }}
        className="hover:bg-[var(--paper-3)]"
      >
        <div style={{ width: 24, height: 24, background: "var(--brand)", borderRadius: 6, display: "grid", placeItems: "center", color: "white", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>A</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Acme Robotics</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>Pro · 142 seats</div>
        </div>
        <ChevronDown style={{ width: 14, height: 14, color: "var(--ink-4)" }} />
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px 16px" }}>
        {/* Workspace group */}
        <div style={{ padding: "8px 0" }}>
          <GroupHeader id="workspace" title="Workspace" />
          {openGroups.workspace && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "2px 4px" }}>
              {navItems.map((item) => <NavItem key={item.href} item={item} />)}
            </div>
          )}
        </div>

        {/* Governance group */}
        <div style={{ padding: "8px 0" }}>
          <GroupHeader id="governance" title="Governance" />
          {openGroups.governance && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "2px 4px" }}>
              {governanceItems.map((item) => <NavItem key={item.href} item={item as typeof navItems[0]} />)}
            </div>
          )}
        </div>
      </div>

      {/* Invite card */}
      <div className="od-invite-card">
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", position: "relative" }}>Invite your team</h4>
        <p style={{ margin: "5px 0 10px", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5, position: "relative" }}>
          New members get access to API keys, usage, and audit trails.
        </p>
        <Link
          href="/dashboard/team"
          style={{
            position: "relative", display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 999, background: "var(--ink)", color: "white",
            fontSize: 11.5, fontWeight: 500, textDecoration: "none", transition: "transform 0.15s",
            whiteSpace: "nowrap",
          }}
          className="hover:opacity-90"
        >
          <UserPlus style={{ width: 12, height: 12 }} /> Invite people
        </Link>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--line)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 999, background: "var(--brand)",
          color: "white", fontWeight: 600, fontSize: 11,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>U</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ink)" }}>Your Account</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>OpenDoor Pro</div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 6, border: "1px solid transparent", background: "transparent", color: "var(--ink-3)", cursor: "pointer", transition: "all 0.15s" }}
          className="hover:bg-[var(--paper-3)] hover:text-[var(--ink)]"
        >
          <LogOut style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </aside>
  );
}
