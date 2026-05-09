import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { policyViolations, modelPolicies, apiKeys } from "@opendoor/database";
import { eq, desc, and, isNull, isNotNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const { searchParams } = new URL(req.url);
  const severity = searchParams.get("severity");
  const resolved = searchParams.get("resolved");

  const db = getDb();

  const conditions = [eq(policyViolations.organizationId, orgId)];
  if (severity) conditions.push(eq(policyViolations.severity, severity as "low" | "medium" | "high" | "critical"));
  if (resolved === "false") conditions.push(isNull(policyViolations.resolvedAt));
  if (resolved === "true") conditions.push(isNotNull(policyViolations.resolvedAt));

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
    .orderBy(desc(policyViolations.createdAt));

  const violations = rows.map((r) => ({
    ...r.violation,
    policyName: r.policyName ?? null,
    policyAction: r.policyAction ?? null,
    apiKeyName: r.apiKeyName ?? null,
  }));

  return NextResponse.json({ violations });
}
