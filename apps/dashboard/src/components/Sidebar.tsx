"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Key, BarChart3, CreditCard, Play, Settings,
  ClipboardList, Users, LogOut, Zap, Server, Calculator,
  ShieldCheck, Gavel, AlertTriangle, FileCheck, BookOpen,
  Building2, UserCog, Coins, ShieldAlert, GitBranch, List,
} from "lucide-react";
import posthog from "posthog-js";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/api-keys", label: "API Keys", icon: Key },
  { href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
  { href: "/dashboard/pricing", label: "Pricing", icon: Calculator },
  { href: "/dashboard/deployments", label: "Deployments", icon: Server },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/playground", label: "Playground", icon: Play },
  { href: "/dashboard/workflow", label: "Workflow", icon: GitBranch },
  { href: "/dashboard/models", label: "Models", icon: List },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/audit-logs", label: "Audit Logs", icon: ClipboardList },
];

const governanceItems = [
  { href: "/dashboard/governance", label: "Trust Center", icon: ShieldCheck },
  { href: "/dashboard/governance/policies", label: "Policies", icon: Gavel },
  { href: "/dashboard/governance/violations", label: "Violations", icon: AlertTriangle },
  { href: "/dashboard/governance/approvals", label: "Approvals", icon: FileCheck },
  { href: "/dashboard/governance/compliance", label: "Compliance", icon: BookOpen },
  { href: "/dashboard/governance/sector-templates", label: "Sector Packs", icon: Building2 },
];

const adminNavItems = [
  { href: "/admin", label: "Platform", icon: Building2 },
  { href: "/admin/orgs", label: "Organizations", icon: Building2 },
  { href: "/admin/users", label: "All Users", icon: UserCog },
  { href: "/admin/credits", label: "Credits", icon: Coins },
  { href: "/admin/audit-logs", label: "Audit Trail", icon: ShieldAlert },
];

export default function Sidebar({ isSiteAdmin = false }: { isSiteAdmin?: boolean }) {
  const pathname = usePathname();

  async function logout() {
    try {
      posthog.capture("user_logged_out");
      posthog.reset();
    } catch { /* noop */ }
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function isActive(href: string) {
    if (href === "/dashboard" || href === "/admin") return pathname === href;
    return pathname?.startsWith(href);
  }

  const NavItem = ({ item, isAdmin = false }: { item: { href: string; label: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }; isAdmin?: boolean }) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <li style={{ listStyle: "none" }}>
        <Link
          href={item.href}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            height: 48,
            padding: "0 24px 0 16px",
            borderRadius: 9999,
            margin: "1px 12px",
            fontSize: 14,
            fontWeight: active ? 500 : 400,
            letterSpacing: "0.1px",
            textDecoration: "none",
            transition: "background 0.15s, color 0.15s",
            background: active
              ? isAdmin
                ? "rgba(26, 115, 232, 0.12)"
                : "var(--md-secondary-container)"
              : "transparent",
            color: active
              ? isAdmin
                ? "var(--md-primary)"
                : "var(--md-on-secondary-container)"
              : "var(--md-on-surface-variant)",
          }}
          className={!active ? "hover:bg-[color-mix(in_srgb,var(--md-on-surface)_8%,transparent)] hover:!text-[var(--md-on-surface)]" : ""}
        >
          <Icon style={{
            width: 20, height: 20, flexShrink: 0,
            color: active
              ? isAdmin ? "var(--md-primary)" : "var(--md-on-secondary-container)"
              : "var(--md-on-surface-variant)",
          }} />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <aside style={{
      width: 256,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      background: "var(--md-surface-container-low)",
      borderRight: "1px solid var(--md-outline-variant)",
    }}>
      {/* Logo */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "20px 28px",
        borderBottom: "1px solid var(--md-outline-variant)",
      }}>
        <div style={{
          width: 36, height: 36,
          borderRadius: "var(--md-shape-md)",
          background: "var(--md-primary)",
          display: "grid", placeItems: "center",
          flexShrink: 0,
        }}>
          <Zap style={{ width: 18, height: 18, color: "white" }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 500, color: "var(--md-on-surface)", letterSpacing: 0 }}>
          OpenDoor
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: "auto", paddingTop: 8, paddingBottom: 8 }}>
        {/* Main nav */}
        <ul style={{ padding: 0, margin: 0 }}>
          {navItems.map((item) => <NavItem key={item.href} item={item} />)}
        </ul>

        {/* Governance section */}
        <div style={{ marginTop: 16 }}>
          <p style={{
            padding: "8px 28px 4px",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "var(--md-on-surface-variant)",
            margin: 0,
          }}>
            Governance
          </p>
          <ul style={{ padding: 0, margin: 0 }}>
            {governanceItems.map((item) => <NavItem key={item.href} item={item} />)}
          </ul>
        </div>

        {/* Admin section */}
        {isSiteAdmin && (
          <div style={{ marginTop: 16 }}>
            <div style={{ height: 1, background: "var(--md-outline-variant)", margin: "0 16px 12px" }} />
            <p style={{
              padding: "0 28px 4px",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "var(--md-primary)",
              margin: 0,
            }}>
              Admin
            </p>
            <ul style={{ padding: 0, margin: 0 }}>
              {adminNavItems.map((item) => <NavItem key={item.href} item={item} isAdmin />)}
            </ul>
          </div>
        )}
      </nav>

      {/* Sign out */}
      <div style={{ borderTop: "1px solid var(--md-outline-variant)", padding: "8px 12px" }}>
        <button
          onClick={logout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            height: 48,
            padding: "0 24px 0 16px",
            borderRadius: 9999,
            border: "none",
            background: "transparent",
            fontSize: 14,
            fontWeight: 400,
            letterSpacing: "0.1px",
            color: "var(--md-on-surface-variant)",
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--md-error) 8%, transparent)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--md-error)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--md-on-surface-variant)";
          }}
        >
          <LogOut style={{ width: 20, height: 20, flexShrink: 0 }} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
