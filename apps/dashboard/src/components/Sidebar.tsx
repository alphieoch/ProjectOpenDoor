"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Key,
  BarChart3,
  CreditCard,
  Play,
  Settings,
  ClipboardList,
  Users,
  LogOut,
  DoorOpen,
  Server,
  Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/api-keys", label: "API Keys", icon: Key },
  { href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
  { href: "/dashboard/pricing", label: "Pricing", icon: Calculator },
  { href: "/dashboard/deployments", label: "Deployments", icon: Server },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/playground", label: "Playground", icon: Play },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/audit-logs", label: "Audit Logs", icon: ClipboardList },
];

export default function Sidebar() {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
        <DoorOpen className="h-6 w-6 text-primary-600" />
        <span className="text-lg font-bold text-gray-900">OpenDoor</span>
      </div>

      <nav className="flex-1 px-4 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-gray-200 p-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
