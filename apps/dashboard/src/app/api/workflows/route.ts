import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflows } from "@opendoor/database";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { normalizeTrigger, parseVariables } from "@opendoor/shared";
import { ensureWorkflowSchema } from "@/lib/workflows/ensure-schema";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  await ensureWorkflowSchema();

  const db = getDb();
  const items = await db
    .select()
    .from(workflows)
    .where(eq(workflows.organizationId, orgId))
    .orderBy(desc(workflows.updatedAt));

  return NextResponse.json({ workflows: items });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();
  await ensureWorkflowSchema();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const [item] = await db
    .insert(workflows)
    .values({
      organizationId: orgId,
      name: body.name.trim(),
      description: body.description ?? null,
      category: body.category ?? "general",
      status: "draft",
      graph: body.graph ?? { nodes: [], edges: [] },
      tags: body.tags ?? [],
      trigger: normalizeTrigger(body.trigger),
      variables: parseVariables(body.variables),
      createdBy: session.sub as string,
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "workflow.created" as any,
    entityType: "workflow",
    entityId: item.id,
    metadata: { name: item.name, category: item.category },
  });

  return NextResponse.json({ workflow: item });
}
