import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { complianceControls } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await requireAuth();

  const { searchParams } = new URL(req.url);
  const framework = searchParams.get("framework");

  const db = getDb();
  let query = db.select().from(complianceControls);
  const items = await query;

  let filtered = items;
  if (framework) {
    filtered = filtered.filter((i) => i.framework === framework);
  }

  return NextResponse.json({ controls: filtered });
}
