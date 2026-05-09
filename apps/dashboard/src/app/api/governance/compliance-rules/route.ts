import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { complianceRules } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    const db = getDb();
    const rules = await db
      .select()
      .from(complianceRules)
      .where(eq(complianceRules.organizationId, orgId))
      .orderBy(complianceRules.framework, complianceRules.name);

    return NextResponse.json({ rules });
  } catch (error: any) {
    console.error("Compliance rules fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch compliance rules" },
      { status: 500 }
    );
  }
}
