import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflowVersions, workflows } from "@opendoor/database";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { ensureWorkflowSchema } from "@/lib/workflows/ensure-schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  await ensureWorkflowSchema();

  const db = getDb();
  const [item] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
    .limit(1);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await db
    .select({
      id: workflowVersions.id,
      version: workflowVersions.version,
      note: workflowVersions.note,
      publishedAt: workflowVersions.publishedAt,
      publishedBy: workflowVersions.publishedBy,
    })
    .from(workflowVersions)
    .where(and(eq(workflowVersions.workflowId, id), eq(workflowVersions.organizationId, orgId)))
    .orderBy(desc(workflowVersions.version))
    .limit(25);

  return NextResponse.json({ versions });
}
