import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflowVersions, workflows } from "@opendoor/database";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { nextCronRun, nextPublishedVersion, normalizeTrigger, parseVariables } from "@opendoor/shared";
import { ensureWorkflowSchema } from "@/lib/workflows/ensure-schema";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  await ensureWorkflowSchema();

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const db = getDb();
  const [existing] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const graph = existing.graph || { nodes: [], edges: [] };
  const nodes = (graph as { nodes?: unknown[] }).nodes || [];
  if (!nodes.length) {
    return NextResponse.json({ error: "Add at least one node before publishing." }, { status: 400 });
  }

  const version = nextPublishedVersion(existing.publishedVersion);
  const trigger = normalizeTrigger(existing.trigger);
  const variables = parseVariables(existing.variables);
  const now = new Date();
  const nextRunAt = trigger.type === "schedule" && trigger.cron ? nextCronRun(trigger.cron, now) : existing.nextRunAt;

  const [published] = await db
    .update(workflows)
    .set({
      publishedGraph: graph,
      publishedVersion: version,
      publishedAt: now,
      status: existing.status === "archived" ? existing.status : "active",
      nextRunAt,
      updatedAt: now,
    })
    .where(and(eq(workflows.id, existing.id), eq(workflows.organizationId, orgId)))
    .returning();

  const [snapshot] = await db
    .insert(workflowVersions)
    .values({
      workflowId: existing.id,
      organizationId: orgId,
      version,
      graph,
      trigger,
      variables,
      note: note || null,
      publishedBy: session.sub as string,
      publishedAt: now,
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "workflow.published" as any,
    entityType: "workflow",
    entityId: existing.id,
    metadata: { version, note },
  });

  return NextResponse.json({ workflow: published, version: snapshot });
}
