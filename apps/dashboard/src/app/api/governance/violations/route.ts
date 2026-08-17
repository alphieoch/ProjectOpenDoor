import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { policyViolations, modelPolicies, apiKeys } from "@opendoor/database";
import { eq, desc, and, isNull, isNotNull, gte } from "drizzle-orm";
import { emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;

  try {
    const { searchParams } = new URL(req.url);
    const severity = searchParams.get("severity");
    const resolved = searchParams.get("resolved");
    const days = parseInt(searchParams.get("days") ?? "90", 10);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "200", 10) || 200, 1), 500);

    const db = getDb();

    const conditions = [eq(policyViolations.organizationId, orgId)];
    if (severity) conditions.push(eq(policyViolations.severity, severity as "low" | "medium" | "high" | "critical"));
    if (resolved === "false") conditions.push(isNull(policyViolations.resolvedAt));
    if (resolved === "true") conditions.push(isNotNull(policyViolations.resolvedAt));
    if (Number.isFinite(days) && days > 0) {
      conditions.push(gte(policyViolations.createdAt, new Date(Date.now() - days * 864e5)));
    }

    const rows = await db
      .select({
        violation: policyViolations,
        policyName: modelPolicies.name,
        policyAction: modelPolicies.action,
        apiKeyName: apiKeys.name,
      })
      .from(policyViolations)
      .leftJoin(modelPolicies, eq(policyViolations.policyId, modelPolicies.id))
      .leftJoin(apiKeys, eq(policyViolations.apiKeyId, apiKeys.id))
      .where(and(...conditions))
      .orderBy(desc(policyViolations.createdAt))
      .limit(limit);

    const violations = rows.map((r) => ({
      ...r.violation,
      policyName: r.policyName ?? null,
      policyAction: r.policyAction ?? null,
      apiKeyName: r.apiKeyName ?? null,
    }));

    return NextResponse.json({ violations });
  } catch (err) {
    return NextResponse.json(emptyOnMissingTable({ violations: [] }, err));
  }
}
