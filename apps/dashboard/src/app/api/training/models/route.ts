import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fineTunedModels } from "@opendoor/database";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  try {
    const db = getDb();
    const models = await db
      .select()
      .from(fineTunedModels)
      .where(
        and(
          eq(fineTunedModels.organizationId, orgId),
          eq(fineTunedModels.status, "active")
        )
      )
      .orderBy(desc(fineTunedModels.createdAt));
    return NextResponse.json({ models });
  } catch (err) {
    console.error("[training/models]", err);
    return NextResponse.json({ models: [], error: "Failed to load models" }, { status: 500 });
  }
}
