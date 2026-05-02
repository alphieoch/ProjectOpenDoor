import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelCatalog } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  await requireAuth();

  const db = getDb();
  const items = await db.query.modelCatalog.findMany({
    where: eq(modelCatalog.enabled, true),
    orderBy: [modelCatalog.displayName],
  });

  return NextResponse.json({ catalog: items });
}
