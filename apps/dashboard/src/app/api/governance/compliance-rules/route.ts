import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { complianceRules } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET() {
  const session = await governanceSession();
  if (!session) return unauthorized();

  try {
    const db = getDb();
    const rules = await db
      .select()
      .from(complianceRules)
      .where(eq(complianceRules.organizationId, session.orgId))
      .orderBy(complianceRules.framework, complianceRules.name);

    return NextResponse.json({ rules });
  } catch (err) {
    try {
      return NextResponse.json(emptyOnMissingTable({ rules: [] }, err));
    } catch {
      console.error("Compliance rules fetch error:", err);
      return NextResponse.json({ error: "Failed to fetch compliance rules" }, { status: 500 });
    }
  }
}
