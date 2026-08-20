import type { ComponentType, CSSProperties } from "react";
import {
  LayoutDashboard, Key, BarChart3, Calculator, Server, CreditCard,
  Play, Users, Settings, ClipboardList, ShieldCheck, Gavel, LifeBuoy, Monitor,
  Gem, Aperture, AlertTriangle, FileCheck, BookOpen, Building2, Bot,
  GitBranch, List, FlaskConical, ScrollText, MessageSquare, Image as ImageIcon, Wrench,
  ShieldAlert,
} from "lucide-react";
import { AgentsNavIcon } from "@/components/ui/agents-nav-icon";

export type SidebarIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: SidebarIcon;
  badgeKey?: "deployments" | "agents" | "openViolations" | "pendingApprovals";
  children?: DashboardNavItem[];
  opensSettings?: boolean;
};

export type DashboardNavGroup = {
  id: "main" | "build" | "account" | "governance" | "admin";
  label: string;
  siteAdminOnly?: boolean;
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
      {
        href: "/dashboard/agents",
        label: "Agents",
        icon: AgentsNavIcon,
        badgeKey: "agents",
        children: [
          { href: "/dashboard/openbot", label: "OpenBot", icon: Monitor, opensSettings: true },
          { href: "/dashboard/ai-assistants", label: "AI Assistants", icon: Bot },
        ],
      },
    ],
  },
  {
    id: "build",
    label: "Build",
    items: [
      { href: "/dashboard/models", label: "Models", icon: List },
      { href: "/dashboard/api-keys", label: "API Keys", icon: Key },
      { href: "/dashboard/workflow", label: "Workflow", icon: GitBranch },
      { href: "/dashboard/tools", label: "Tools", icon: Wrench },
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
  {
    id: "admin",
    label: "Admin",
    siteAdminOnly: true,
    items: [
      { href: "/dashboard/admin", label: "Platform", icon: ShieldAlert },
    ],
  },
];

export const CHILD_HIDDEN_HREFS = new Set([
  "/dashboard/playground",
  "/dashboard/playground/media",
  "/dashboard/studio",
  "/dashboard/premium",
]);

export function navGroupsForViewer(opts: {
  isSiteAdmin?: boolean;
  protectedChild?: boolean;
}): DashboardNavGroup[] {
  return dashboardNavGroups
    .filter((group) => !group.siteAdminOnly || Boolean(opts.isSiteAdmin))
    .map((group) => ({
      ...group,
      items: (opts.protectedChild
        ? group.items.filter((item) => !CHILD_HIDDEN_HREFS.has(item.href))
        : group.items
      ).map((item) => ({
        ...item,
        children: item.children?.filter(
          (child) => !opts.protectedChild || !CHILD_HIDDEN_HREFS.has(child.href),
        ),
      })),
    }))
    .filter((group) => group.items.length > 0);
}

export const dockItems: DashboardNavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/playground", label: "Playground", icon: Play },
  { href: "/dashboard/agents", label: "Agents", icon: AgentsNavIcon },
];

function collectNavHrefs(items: DashboardNavItem[]): string[] {
  return items.flatMap((item) => [item.href, ...collectNavHrefs(item.children ?? [])]);
}

/** Every sidebar href, including cross-group prefixes like /playground vs /playground/media. */
export function allDashboardNavHrefs(): string[] {
  return dashboardNavGroups.flatMap((group) => collectNavHrefs(group.items));
}

export function isNavActive(
  pathname: string | null,
  href: string,
  siblings: { href: string }[] = [],
) {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;
  const moreSpecific = new Set([
    ...siblings.map((s) => s.href),
    ...allDashboardNavHrefs(),
  ]);
  return ![...moreSpecific].some(
    (other) =>
      other !== href &&
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}
