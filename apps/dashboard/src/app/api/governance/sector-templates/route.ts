import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sectorTemplates } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET(req: NextRequest) {
  await requireAuth();

  const { searchParams } = new URL(req.url);
  const sector = searchParams.get("sector");

  const db = getDb();
  let query = db.select().from(sectorTemplates).where(eq(sectorTemplates.enabled, true));
  const items = await query;

  let filtered = items;
  if (sector) {
    filtered = filtered.filter((i) => i.sector === sector);
  }

  return NextResponse.json({ templates: filtered });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const db = getDb();
  const [item] = await db
    .insert(sectorTemplates)
    .values({
      sector: body.sector,
      name: body.name,
      description: body.description,
      defaultModels: body.defaultModels || [],
      defaultPolicies: body.defaultPolicies,
      promptTemplates: body.promptTemplates,
      guardrailConfig: body.guardrailConfig,
      complianceRequirements: body.complianceRequirements || [],
      enabled: body.enabled !== false,
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.sector_template.created",
    entityType: "sector_template",
    entityId: item.id,
    metadata: { sector: body.sector, name: body.name },
  });

  return NextResponse.json({ template: item });
}
