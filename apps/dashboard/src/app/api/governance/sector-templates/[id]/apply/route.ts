import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sectorTemplates, modelPolicies } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  const [template] = await db
    .select()
    .from(sectorTemplates)
    .where(eq(sectorTemplates.id, params.id))
    .limit(1);

  if (!template) {
    return NextResponse.json({ error: "Sector pack not found" }, { status: 404 });
  }

  const policies = (template.defaultPolicies ?? {}) as {
    dataClass?: string;
    requireHumanApproval?: boolean;
    bannedUses?: string[];
  };

  const dataClass = (policies.dataClass ?? "internal") as
    | "public"
    | "internal"
    | "confidential"
    | "restricted";
  const requireHumanApproval = policies.requireHumanApproval ?? false;
  const bannedUses = policies.bannedUses ?? [];

  const createdIds: string[] = [];

  // Base allow policy for the data class
  const [basePolicy] = await db
    .insert(modelPolicies)
    .values({
      organizationId: orgId,
      name: `[${template.name}] Default Data Policy`,
      description: `Applied from ${template.name} sector pack`,
      dataClass,
      modelIdPattern: "%",
      action: "allow",
      requireHumanApproval,
      scope: "organization",
      enabled: true,
      priority: 100,
      metadata: { appliedFromPack: template.id, sector: template.sector },
    })
    .returning();
  createdIds.push(basePolicy.id);

  // Deny policies for each banned use
  for (const bannedUse of bannedUses) {
    const [denyPolicy] = await db
      .insert(modelPolicies)
      .values({
        organizationId: orgId,
        name: `[${template.name}] Deny: ${bannedUse}`,
        description: `Banned use applied from ${template.name} sector pack`,
        dataClass,
        modelIdPattern: "%",
        action: "deny",
        requireHumanApproval: false,
        scope: "organization",
        enabled: true,
        priority: 50,
        metadata: { appliedFromPack: template.id, bannedUse },
      })
      .returning();
    createdIds.push(denyPolicy.id);
  }

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.sector_pack.applied",
    entityType: "sector_template",
    entityId: template.id,
    metadata: {
      sector: template.sector,
      name: template.name,
      policiesCreated: createdIds.length,
    },
  });

  return NextResponse.json({
    applied: true,
    template: { id: template.id, name: template.name, sector: template.sector },
    policiesCreated: createdIds.length,
  });
}
