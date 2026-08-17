import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deployments, deploymentLoras } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { stopLocalGpuModel } from "@/lib/gpu/local-runner";
import { deleteGcpGpuService } from "@/lib/gcp/deployer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;

  const db = getDb();
  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.organizationId, orgId)),
  });

  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, 404);
  }

  const loras = await db
    .select()
    .from(deploymentLoras)
    .where(eq(deploymentLoras.deploymentId, id));

  return NextResponse.json({
    deployment,
    modelId: `custom:${deployment.id}`,
    loras,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  const body = await req.json();

  const db = getDb();
  const existing = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.organizationId, orgId)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Deployment not found" }, 404);
  }

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name.slice(0, 100);
  if (body.replicas !== undefined) updates.replicas = body.replicas;
  if (body.minReplicas !== undefined) updates.minReplicas = body.minReplicas;
  if (body.maxReplicas !== undefined) updates.maxReplicas = body.maxReplicas;
  if (body.scaleToZero !== undefined) updates.scaleToZero = Boolean(body.scaleToZero);
  if (body.precision !== undefined) updates.precision = String(body.precision).slice(0, 20);
  if (body.weightsUri !== undefined) updates.weightsUri = body.weightsUri || null;
  if (body.regionLocked !== undefined) updates.regionLocked = Boolean(body.regionLocked);
  if (body.reserved !== undefined) {
    updates.reserved = Boolean(body.reserved);
    if (updates.reserved) {
      updates.scaleToZero = false;
      updates.minReplicas = Math.max(1, existing.minReplicas ?? 1);
    }
  }
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "running" && !existing.startedAt) {
      updates.startedAt = new Date();
    }
    if (body.status === "stopped") {
      updates.stoppedAt = new Date();
      if (existing.target === "local") {
        await stopLocalGpuModel(existing.runtimeModel);
      }
    }
  }
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(deployments)
    .set(updates)
    .where(eq(deployments.id, id))
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "deployment.updated",
    entityType: "deployment",
    entityId: id,
    metadata: updates,
  });

  return NextResponse.json({ deployment: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;

  const db = getDb();
  const existing = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.organizationId, orgId)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Deployment not found" }, 404);
  }

  await db
    .update(deployments)
    .set({ status: "deleting", updatedAt: new Date() })
    .where(eq(deployments.id, id));

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "deployment.deleted",
    entityType: "deployment",
    entityId: id,
    metadata: { name: existing.name },
  });

  if (existing.target === "local") {
    await stopLocalGpuModel(existing.runtimeModel);
  } else if (existing.target === "gcp") {
    await deleteGcpGpuService(existing.gcpResourceId);
  }

  await db.delete(deployments).where(eq(deployments.id, id));

  return NextResponse.json({ success: true });
}
