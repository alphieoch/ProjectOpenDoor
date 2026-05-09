import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflows } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  const [item] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, params.id), eq(workflows.organizationId, orgId)))
    .limit(1);

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ workflow: item });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const db = getDb();
  const [item] = await db
    .update(workflows)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(workflows.id, params.id), eq(workflows.organizationId, orgId)))
    .returning();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ workflow: item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  await db
    .delete(workflows)
    .where(and(eq(workflows.id, params.id), eq(workflows.organizationId, orgId)));

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "workflow.deleted" as any,
    entityType: "workflow",
    entityId: params.id,
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
