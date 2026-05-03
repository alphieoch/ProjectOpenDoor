import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, users, requests } from "@opendoor/database";
import { sql, gte } from "drizzle-orm";
import { verifySiteAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await verifySiteAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getDb();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      plan: organizations.plan,
      creditsUsdCents: organizations.creditsUsdCents,
      subscriptionStatus: organizations.subscriptionStatus,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .orderBy(organizations.createdAt);

  const memberCounts = await db
    .select({
      organizationId: users.organizationId,
      count: sql<number>`COUNT(*)`,
    })
    .from(users)
    .groupBy(users.organizationId);

  const usageStats = await db
    .select({
      organizationId: requests.organizationId,
      totalRequests: sql<number>`COUNT(*)`,
      totalCostUsd: sql<number>`SUM(${requests.costUsd})`,
    })
    .from(requests)
    .where(gte(requests.createdAt, since30))
    .groupBy(requests.organizationId);

  const memberMap = Object.fromEntries(
    memberCounts.map((m) => [m.organizationId, m.count])
  );
  const usageMap = Object.fromEntries(
    usageStats.map((u) => [u.organizationId, u])
  );

  const result = orgs.map((org) => ({
    ...org,
    memberCount: memberMap[org.id] || 0,
    totalRequests: usageMap[org.id]?.totalRequests || 0,
    totalCostUsd: usageMap[org.id]?.totalCostUsd || 0,
  }));

  return NextResponse.json({ orgs: result });
}
