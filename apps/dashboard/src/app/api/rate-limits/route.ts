import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requests, apiKeys } from "@opendoor/database";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();

  // Find the user's API keys
  const keys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.organizationId, orgId),
    columns: {
      id: true,
      rateLimitRpm: true,
      rateLimitTpm: true,
    },
  });

  // Aggregate across all keys for the org
  const rpm = keys.length > 0 ? Math.max(...keys.map((k) => k.rateLimitRpm || 60)) : 60;
  const tpm = keys.length > 0 ? Math.max(...keys.map((k) => k.rateLimitTpm || 100000)) : 100000;

  // Count requests in the last minute from the requests table
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const recentStats = await db
    .select({
      requestCount: sql<number>`COUNT(*)`,
      tokenSum: sql<number>`COALESCE(SUM(${requests.totalTokens}), 0)`,
    })
    .from(requests)
    .where(
      and(
        eq(requests.organizationId, orgId),
        gte(requests.createdAt, oneMinuteAgo)
      )
    );

  const usedRpm = recentStats[0]?.requestCount || 0;
  const usedTpm = recentStats[0]?.tokenSum || 0;

  return NextResponse.json({
    rpm: {
      limit: rpm,
      used: usedRpm,
      remaining: Math.max(0, rpm - usedRpm),
    },
    tpm: {
      limit: tpm,
      used: usedTpm,
      remaining: Math.max(0, tpm - usedTpm),
    },
    resetAt: new Date(Date.now() + 60000).toISOString(),
  });
}
