import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { auditLogs, users, organizations } from "@opendoor/database";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { verifySiteAdmin } from "@/lib/auth";
import { DuckDBAnalyticsClient, searchAuditLogs } from "@opendoor/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await verifySiteAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const search = searchParams.get("search");
  const action = searchParams.get("action");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const limit = parseInt(searchParams.get("limit") || "200", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // ── DuckDB path when search or large pagination is requested ──────────────
  const useDuckDB = search || limit > 200 || offset > 0 || dateFrom || dateTo;

  if (useDuckDB) {
    const client = new DuckDBAnalyticsClient();
    if (client.isEnabled()) {
      try {
        await client.init();
        const logs = await searchAuditLogs(client, {
          organizationId: orgId || "",
          search: search || undefined,
          action: action || undefined,
          dateFrom: dateFrom ? new Date(dateFrom) : undefined,
          dateTo: dateTo ? new Date(dateTo) : undefined,
          limit: Math.min(limit, 1000),
          offset,
        });
        return NextResponse.json({ logs, engine: "duckdb" });
      } catch (err) {
        console.error("[DuckDB] Audit search failed, falling back:", err);
        // Fall through to Drizzle
      }
    }
  }

  // ── Default Drizzle path ──────────────────────────────────────────────────
  const db = getDb();

  const conditions = [];
  if (orgId) conditions.push(eq(auditLogs.organizationId, orgId));
  if (dateFrom) conditions.push(gte(auditLogs.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(auditLogs.createdAt, new Date(dateTo)));

  const baseQuery = db
    .select({
      id: auditLogs.id,
      organizationId: auditLogs.organizationId,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      userName: users.name,
      userEmail: users.email,
      orgName: organizations.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .leftJoin(organizations, eq(auditLogs.organizationId, organizations.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(limit, 1000));

  const logs = conditions.length > 0
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;

  return NextResponse.json({ logs });
}
