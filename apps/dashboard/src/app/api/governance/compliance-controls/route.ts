import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { complianceControls } from "@opendoor/database";
import { emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const framework = searchParams.get("framework");

    const db = getDb();
    const items = await db.select().from(complianceControls);
    const filtered = framework ? items.filter((i) => i.framework === framework) : items;

    return NextResponse.json({ controls: filtered });
  } catch (err) {
    return NextResponse.json(emptyOnMissingTable({ controls: [] }, err));
  }
}
