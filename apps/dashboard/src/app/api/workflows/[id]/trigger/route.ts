import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflows } from "@opendoor/database";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { isTriggerType, normalizeTrigger, triggerNeedsSecret } from "@opendoor/shared";
import { ensureWorkflowSchema } from "@/lib/workflows/ensure-schema";
import { dispatchWorkflowTrigger, secretsEqual, triggerSecretFromRequest } from "@/lib/workflows/dispatch";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await params;
  await ensureWorkflowSchema();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const secret = triggerSecretFromRequest(req);

  const db = getDb();
  const [item] = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const trigger = normalizeTrigger(item.trigger);
  let authorized = secretsEqual(item.webhookSecret, secret);
  let userId: string | undefined;
  if (!authorized) {
    try {
      const session = await requireAuth();
      if (session.orgId !== item.organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      authorized = true;
      userId = session.sub as string;
    } catch {
      authorized = false;
    }
  } else if (triggerNeedsSecret(trigger.type) && item.organizationId) {
    authorized = true;
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const triggerType = isTriggerType(body.triggerType) ? body.triggerType : trigger.type;
  const query = typeof body.query === "string" ? body.query : typeof body.text === "string" ? body.text : undefined;
  const result = await dispatchWorkflowTrigger({
    workflow: item,
    organizationId: item.organizationId,
    triggerType,
    requirePublished: true,
    input: {
      query,
      payload: body,
    },
  });

  if ("error" in result && result.status) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (userId) {
    await logAuditEvent({
      organizationId: item.organizationId,
      userId,
      action: "workflow.triggered" as any,
      entityType: "workflow",
      entityId: item.id,
      metadata: { triggerType, runId: "runId" in result ? result.runId : undefined },
    });
  }

  return NextResponse.json(result);
}
