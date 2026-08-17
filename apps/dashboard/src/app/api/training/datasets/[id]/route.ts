import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { trainingDatasets } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  const db = getDb();

  const existing = await db
    .select()
    .from(trainingDatasets)
    .where(
      and(eq(trainingDatasets.id, id), eq(trainingDatasets.organizationId, orgId))
    )
    .limit(1);

  if (!existing[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(trainingDatasets).where(eq(trainingDatasets.id, id));
  return NextResponse.json({ success: true });
}
