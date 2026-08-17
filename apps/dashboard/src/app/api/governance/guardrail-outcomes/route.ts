import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { guardrailOutcomes } from "@opendoor/database";
import { eq, desc, and, gte } from "drizzle-orm";
import { emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const db = getDb();

    const conditions = [
      eq(guardrailOutcomes.organizationId, orgId),
      eq(guardrailOutcomes.triggered, true),
      gte(guardrailOutcomes.createdAt, since),
    ];
    if (type) conditions.push(eq(guardrailOutcomes.guardrailType, type));

    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "200", 10) || 200, 1), 500);

    const outcomes = await db
      .select()
      .from(guardrailOutcomes)
      .where(and(...conditions))
      .orderBy(desc(guardrailOutcomes.createdAt))
      .limit(limit);

    return NextResponse.json({ outcomes });
  } catch (err) {
    return NextResponse.json(emptyOnMissingTable({ outcomes: [] }, err));
  }
}
