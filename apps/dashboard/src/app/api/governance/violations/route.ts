import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { policyViolations } from "@opendoor/database";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const { searchParams } = new URL(req.url);
  const severity = searchParams.get("severity");
  const resolved = searchParams.get("resolved");

  const db = getDb();
  let query = db
    .select()
    .from(policyViolations)
    .where(eq(policyViolations.organizationId, orgId))
    .orderBy(desc(policyViolations.createdAt));

  // Note: Drizzle query builder pattern for dynamic filters is limited;
  // we run the base query and filter in memory for simplicity.
  const items = await query;

  let filtered = items;
  if (severity) {
    filtered = filtered.filter((i) => i.severity === severity);
  }
  if (resolved === "false") {
    filtered = filtered.filter((i) => !i.resolvedAt);
  }
  if (resolved === "true") {
    filtered = filtered.filter((i) => i.resolvedAt);
  }

  return NextResponse.json({ violations: filtered });
}
