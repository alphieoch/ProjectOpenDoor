import type { ComponentType, CSSProperties } from "react";
import {
  LayoutDashboard, Key, BarChart3, Calculator, Server, CreditCard,
  Play, Users, Settings, ClipboardList, ShieldCheck, Gavel, LifeBuoy,
  Gem, Aperture, AlertTriangle, FileCheck, BookOpen, Building2, Bot,
  GitBranch, List, FlaskConical, ScrollText, MessageSquare, Image as ImageIcon,
} from "lucide-react";
import { AgentsNavIcon } from "@/components/ui/ai-crest";

export type SidebarIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: SidebarIcon;
  badgeKey?: "deployments" | "agents" | "openViolations" | "pendingApprovals";
};

export type DashboardNavGroup = {
  id: "main" | "build" | "account" | "governance";
  label: string;
  items: DashboardNavItem[];
};

export const dashboardNavGroups: DashboardNavGroup[] = [
  {
    id: "main",
    label: "Main",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
      { href: "/dashboard/playground", label: "Playground", icon: Play },
      { href: "/dashboard/studio", label: "Studio", icon: Aperture },
      { href: "/dashboard/agents", label: "Agents", icon: AgentsNavIcon, badgeKey: "agents" },
      { href: "/dashboard/ai-assistants", label: "AI Assistants", icon: Bot },
    ],
  },
  {
    id: "build",
    label: "Build",
    items: [
      { href: "/dashboard/models", label: "Models", icon: List },
      { href: "/dashboard/api-keys", label: "API Keys", icon: Key },
      { href: "/dashboard/workflow", label: "Workflow", icon: GitBranch },
      { href: "/dashboard/deployments", label: "Deployments", icon: Server, badgeKey: "deployments" },
      { href: "/dashboard/training", label: "Training", icon: FlaskConical },
      { href: "/dashboard/playground/media", label: "Media", icon: ImageIcon },
      { href: "/dashboard/premium", label: "Premium", icon: Gem },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      { href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
      { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/pricing", label: "Pricing", icon: Calculator },
      { href: "/dashboard/team", label: "Team", icon: Users },
      { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
      { href: "/dashboard/audit-logs", label: "Audit Logs", icon: ClipboardList },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    items: [
      { href: "/dashboard/governance", label: "Trust Center", icon: ShieldCheck },
      { href: "/dashboard/governance/policies", label: "Policies", icon: Gavel },
      { href: "/dashboard/governance/violations", label: "Violations", icon: AlertTriangle, badgeKey: "openViolations" },
      { href: "/dashboard/governance/approvals", label: "Approvals", icon: FileCheck, badgeKey: "pendingApprovals" },
      { href: "/dashboard/governance/compliance", label: "Compliance", icon: BookOpen },
      { href: "/dashboard/governance/sector-templates", label: "Sector Packs", icon: Building2 },
    ],
  },
];

export const CHILD_HIDDEN_HREFS = new Set([
  "/dashboard/playground",
  "/dashboard/playground/media",
  "/dashboard/studio",
  "/dashboard/premium",
]);

export const dockItems: DashboardNavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/playground", label: "Playground", icon: Play },
  { href: "/dashboard/agents", label: "Agents", icon: AgentsNavIcon },
];

export function isNavActive(pathname: string | null, href: string, siblings: { href: string }[]) {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;
  return !siblings.some(
    (s) =>
      s.href !== href &&
      s.href.startsWith(`${href}/`) &&
      (pathname === s.href || pathname.startsWith(`${s.href}/`)),
  );
}
