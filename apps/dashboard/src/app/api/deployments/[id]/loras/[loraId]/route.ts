import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deployments, deploymentLoras } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { unloadLoraOnEndpoint } from "@/lib/gpu/lora";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; loraId: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id, loraId } = await params;

  const db = getDb();
  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.organizationId, orgId)),
  });
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const lora = await db.query.deploymentLoras.findFirst({
    where: and(eq(deploymentLoras.id, loraId), eq(deploymentLoras.deploymentId, id)),
  });
  if (!lora) {
    return NextResponse.json({ error: "LoRA not found" }, { status: 404 });
  }

  if (deployment.fqdn && lora.status === "loaded" && deployment.target !== "local") {
    await unloadLoraOnEndpoint({ fqdn: deployment.fqdn, name: lora.name });
  }

  await db.delete(deploymentLoras).where(eq(deploymentLoras.id, loraId));

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "deployment.lora_unloaded",
    entityType: "deployment_lora",
    entityId: loraId,
    metadata: { deploymentId: id, name: lora.name },
  });

  return NextResponse.json({ success: true });
}
