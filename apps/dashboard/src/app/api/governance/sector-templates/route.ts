import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sectorTemplates, modelPolicies } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";
import { appliedPackIds, pickCanonicalPacks } from "@/lib/governance/sector-packs";

export async function GET(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const sector = searchParams.get("sector");
    const all = searchParams.get("all") === "1";

    const db = getDb();
    const [items, policies] = await Promise.all([
      db.select().from(sectorTemplates).where(eq(sectorTemplates.enabled, true)),
      db
        .select({ metadata: modelPolicies.metadata })
        .from(modelPolicies)
        .where(eq(modelPolicies.organizationId, session.orgId)),
    ]);

    const scoped = sector ? items.filter((i) => i.sector === sector) : items;
    const templates = all ? scoped : pickCanonicalPacks(scoped);
    const appliedIds = appliedPackIds(policies);

    return NextResponse.json({ templates, appliedIds });
  } catch (err) {
    return NextResponse.json(emptyOnMissingTable({ templates: [], appliedIds: [] }, err));
  }
}

export async function POST(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;
  const body = await req.json();
  const actorId = await orgActorId(session);

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
    userId: actorId ?? undefined,
    action: "governance.sector_template.created",
    entityType: "sector_template",
    entityId: item.id,
    metadata: { sector: body.sector, name: body.name },
  });

  return NextResponse.json({ template: item });
}
