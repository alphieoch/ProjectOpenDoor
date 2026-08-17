import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiKeys, providers, requests } from "@opendoor/database";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 50)));
  const status = searchParams.get("status");
  const q = (searchParams.get("q") || "").trim().replace(/[%_]/g, "");

  try {
    const db = getDb();
    const filters = [eq(requests.organizationId, orgId)];
    if (status === "success" || status === "error" || status === "cached") {
      filters.push(eq(requests.status, status));
    }
    if (q) {
      filters.push(
        or(ilike(requests.modelId, `%${q}%`), ilike(requests.region, `%${q}%`))!
      );
    }

    const rows = await db
      .select({
        id: requests.id,
        modelId: requests.modelId,
        requestType: requests.requestType,
        promptTokens: requests.promptTokens,
        completionTokens: requests.completionTokens,
        totalTokens: requests.totalTokens,
        latencyMs: requests.latencyMs,
        costUsd: requests.costUsd,
        status: requests.status,
        errorMessage: requests.errorMessage,
        region: requests.region,
        createdAt: requests.createdAt,
        provider: providers.slug,
        apiKeyName: apiKeys.name,
        apiKeyPrefix: apiKeys.keyPrefix,
      })
      .from(requests)
      .leftJoin(providers, eq(requests.providerId, providers.id))
      .leftJoin(apiKeys, eq(requests.apiKeyId, apiKeys.id))
      .where(and(...filters))
      .orderBy(desc(requests.createdAt))
      .limit(limit);

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(requests)
      .where(and(...filters));

    return NextResponse.json({
      requests: rows.map((r) => ({
        ...r,
        costUsd: Number(r.costUsd || 0),
      })),
      total: Number(count || 0),
    });
  } catch (err) {
    console.error("[requests] list failed:", err);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }
}
