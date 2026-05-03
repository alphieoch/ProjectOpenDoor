export const dynamic = "force-dynamic";

import { getDb } from "@/lib/db";
import { organizations, users, requests } from "@opendoor/database";
import { sql } from "drizzle-orm";
import { requireSiteAdmin } from "@/lib/auth";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { Building2, Users, Activity, DollarSign } from "lucide-react";

export default async function AdminOverviewPage() {
  await requireSiteAdmin();

  const db = getDb();

  const [orgCount, userCount, requestStats] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(organizations),
    db.select({ count: sql<number>`COUNT(*)` }).from(users),
    db.select({
      totalRequests: sql<number>`COUNT(*)`,
      totalCost: sql<number>`SUM(${requests.costUsd})`,
    }).from(requests),
  ]);

  const stats = [
    { title: "Organizations", value: formatNumber(orgCount[0]?.count || 0), icon: Building2 },
    { title: "Total Users", value: formatNumber(userCount[0]?.count || 0), icon: Users },
    { title: "All-time Requests", value: formatNumber(requestStats[0]?.totalRequests || 0), icon: Activity },
    { title: "All-time Revenue", value: formatCurrency(requestStats[0]?.totalCost || 0), icon: DollarSign },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Platform Overview</h1>
        <p className="page-desc">All-time stats across all organizations</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.title} className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-500">{s.title}</p>
                  <p className="mt-1.5 text-2xl font-semibold text-zinc-900">{s.value}</p>
                </div>
                <div className="rounded-lg bg-indigo-50 p-2.5">
                  <Icon className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <a href="/admin/orgs" className="card p-6 transition-shadow hover:shadow-md">
          <Building2 className="h-6 w-6 text-indigo-600" />
          <h3 className="mt-3 font-semibold text-zinc-900">Organizations</h3>
          <p className="mt-1 text-sm text-zinc-500">View and manage all client organizations, plans, and usage</p>
        </a>
        <a href="/admin/users" className="card p-6 transition-shadow hover:shadow-md">
          <Users className="h-6 w-6 text-indigo-600" />
          <h3 className="mt-3 font-semibold text-zinc-900">Users</h3>
          <p className="mt-1 text-sm text-zinc-500">View all users, manage roles, and grant site admin access</p>
        </a>
        <a href="/admin/credits" className="card p-6 transition-shadow hover:shadow-md">
          <DollarSign className="h-6 w-6 text-indigo-600" />
          <h3 className="mt-3 font-semibold text-zinc-900">Credits</h3>
          <p className="mt-1 text-sm text-zinc-500">Manually add or adjust credits for any organization</p>
        </a>
      </div>
    </div>
  );
}
