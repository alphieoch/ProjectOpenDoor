import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { guardrailOutcomes } from "@opendoor/database";
import { eq, desc, and, gte } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

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

  const outcomes = await db
    .select()
    .from(guardrailOutcomes)
    .where(and(...conditions))
    .orderBy(desc(guardrailOutcomes.createdAt));

  return NextResponse.json({ outcomes });
}
