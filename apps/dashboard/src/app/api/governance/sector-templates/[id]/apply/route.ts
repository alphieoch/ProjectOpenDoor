import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sectorTemplates, modelPolicies } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { routeId } from "@/lib/governance/route-id";
import { governanceSession, notFound, unauthorized } from "@/lib/governance/http";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;
  const id = await routeId(params);
  const actorId = await orgActorId(session);

  const db = getDb();
  const [template] = await db
    .select()
    .from(sectorTemplates)
    .where(eq(sectorTemplates.id, id))
    .limit(1);

  if (!template) return notFound("Sector pack not found");

  const existing = await db
    .select({ id: modelPolicies.id, metadata: modelPolicies.metadata })
    .from(modelPolicies)
    .where(eq(modelPolicies.organizationId, orgId));
  const alreadyApplied = existing.some((row) => {
    const meta = row.metadata as { appliedFromPack?: string } | null;
    return meta?.appliedFromPack === id;
  });
  if (alreadyApplied) {
    return NextResponse.json({
      applied: true,
      alreadyApplied: true,
      template: { id: template.id, name: template.name, sector: template.sector },
      policiesCreated: 0,
    });
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

  const [basePolicy] = await db
    .insert(modelPolicies)
    .values({
      organizationId: orgId,
      name: `[${template.name}] ${dataClass} traffic`,
      description: requireHumanApproval
        ? `Live gateway rule from ${template.name}: ${dataClass} requests pause for approval.`
        : `Live gateway rule from ${template.name} for ${dataClass} data.`,
      dataClass,
      modelIdPattern: "*",
      action: requireHumanApproval ? "require_approval" : "allow",
      requireHumanApproval,
      scope: "organization",
      enabled: true,
      priority: requireHumanApproval ? 20 : 100,
      metadata: { appliedFromPack: template.id, sector: template.sector },
    })
    .returning();
  createdIds.push(basePolicy.id);

  for (const bannedUse of bannedUses) {
    const [denyPolicy] = await db
      .insert(modelPolicies)
      .values({
        organizationId: orgId,
        name: `[${template.name}] Deny: ${bannedUse}`,
        description: `Blocks ${dataClass} prompts that look like “${bannedUse}”. Runs on the gateway before a provider is called.`,
        dataClass,
        modelIdPattern: "*",
        action: "deny",
        requireHumanApproval: false,
        scope: "organization",
        enabled: true,
        priority: 15,
        metadata: { appliedFromPack: template.id, bannedUse, sector: template.sector },
      })
      .returning();
    createdIds.push(denyPolicy.id);
  }

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
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
