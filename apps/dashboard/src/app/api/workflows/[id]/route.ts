import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflows } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { nextCronRun, normalizeTrigger, parseVariables, triggerNeedsSecret } from "@opendoor/shared";
import { randomBytes } from "crypto";
import { ensureWorkflowSchema } from "@/lib/workflows/ensure-schema";

async function workflowId(params: { id: string } | Promise<{ id: string }>) {
  return (await params).id;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const id = await workflowId(params);
  await ensureWorkflowSchema();

  const db = getDb();
  const [item] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
    .limit(1);

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ workflow: item });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const id = await workflowId(params);
  const body = await req.json().catch(() => ({}));
  await ensureWorkflowSchema();

  const db = getDb();
  const [existing] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const trigger = body.trigger !== undefined ? normalizeTrigger(body.trigger) : normalizeTrigger(existing.trigger);
  let webhookSecret = existing.webhookSecret;
  if (triggerNeedsSecret(trigger.type) && !webhookSecret) {
    webhookSecret = randomBytes(24).toString("hex");
  }

  let nextRunAt = existing.nextRunAt;
  if (trigger.type === "schedule" && trigger.cron) {
    nextRunAt = nextCronRun(trigger.cron, new Date());
  } else if (trigger.type !== "schedule") {
    nextRunAt = null;
  }

  const [item] = await db
    .update(workflows)
    .set({
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      category: typeof body.category === "string" && body.category.trim() ? body.category : existing.category,
      status: typeof body.status === "string" && body.status.trim() ? body.status : existing.status,
      graph: body.graph !== undefined ? body.graph : existing.graph,
      tags: Array.isArray(body.tags) ? body.tags : existing.tags,
      trigger,
      variables: body.variables !== undefined ? parseVariables(body.variables) : existing.variables,
      webhookSecret,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
    .returning();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ workflow: item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const id = await workflowId(params);
  await ensureWorkflowSchema();

  const db = getDb();
  await db
    .delete(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)));

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "workflow.deleted" as any,
    entityType: "workflow",
    entityId: id,
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
