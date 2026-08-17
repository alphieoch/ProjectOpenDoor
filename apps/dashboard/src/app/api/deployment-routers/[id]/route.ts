import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deploymentRouters, deploymentRouterTargets } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;

  const db = getDb();
  const router = await db.query.deploymentRouters.findFirst({
    where: and(
      eq(deploymentRouters.id, id),
      eq(deploymentRouters.organizationId, orgId)
    ),
  });
  if (!router) {
    return NextResponse.json({ error: "Router not found" }, { status: 404 });
  }

  await db
    .delete(deploymentRouterTargets)
    .where(eq(deploymentRouterTargets.routerId, id));
  await db.delete(deploymentRouters).where(eq(deploymentRouters.id, id));

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "deployment.router_deleted",
    entityType: "deployment_router",
    entityId: id,
    metadata: { slug: router.slug },
  });

  return NextResponse.json({ success: true });
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
  const router = await db.query.deploymentRouters.findFirst({
    where: and(
      eq(deploymentRouters.id, id),
      eq(deploymentRouters.organizationId, orgId)
    ),
  });
  if (!router) {
    return NextResponse.json({ error: "Router not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name.slice(0, 100);
  if (typeof body.status === "string") updates.status = body.status;

  const [updated] = await db
    .update(deploymentRouters)
    .set(updates)
    .where(eq(deploymentRouters.id, id))
    .returning();

  if (Array.isArray(body.targets)) {
    await db
      .delete(deploymentRouterTargets)
      .where(eq(deploymentRouterTargets.routerId, id));
    if (body.targets.length > 0) {
      await db.insert(deploymentRouterTargets).values(
        body.targets.map((t: any) => ({
          routerId: id,
          deploymentId: t.deploymentId || t.deployment_id,
          weight: Math.max(1, Math.floor(Number(t.weight ?? 100))),
        }))
      );
    }
  }

  return NextResponse.json({ router: updated });
}
