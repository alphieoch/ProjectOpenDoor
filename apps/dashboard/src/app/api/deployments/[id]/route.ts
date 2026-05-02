import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deployments } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

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

  return NextResponse.json({ deployment });
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
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "running" && !existing.startedAt) {
      updates.startedAt = new Date();
    }
    if (body.status === "stopped" && !existing.stoppedAt) {
      updates.stoppedAt = new Date();
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

  // TODO: trigger async Azure Container App deletion

  return NextResponse.json({ success: true });
}
