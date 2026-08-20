import { NextRequest, NextResponse } from "next/server";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { disableOrgTool, enableOrgTool } from "@/lib/tools/entitlements";
import { loadWebSearchEntitlement } from "@/lib/web-search/entitlement";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  const addon = await loadWebSearchEntitlement(orgId, session);
  const result = await enableOrgTool({
    orgId,
    toolId: id,
    userId: sessionActorId(session),
    isSiteAdmin: session.isSiteAdmin,
    coveredByAddon: addon.active,
    includedInPlan: addon.includedInPlan,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  await logAuditEvent({
    organizationId: orgId,
    userId: sessionActorId(session),
    action: "tool.enabled",
    entityType: "organization_tool",
    entityId: id,
    metadata: { toolId: id, alreadyEnabled: result.alreadyEnabled },
  });
  return NextResponse.json({ tool: result.entitlement, alreadyEnabled: result.alreadyEnabled });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  const result = await disableOrgTool(orgId, id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  await logAuditEvent({
    organizationId: orgId,
    userId: sessionActorId(session),
    action: "tool.disabled",
    entityType: "organization_tool",
    entityId: id,
    metadata: { toolId: id },
  });
  return NextResponse.json({ tool: result.entitlement });
}
