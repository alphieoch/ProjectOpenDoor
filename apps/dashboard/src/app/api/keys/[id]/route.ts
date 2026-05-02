import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiKeys } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function DELETE(
  _: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, params.id));

  return NextResponse.json({ success: true });
}
