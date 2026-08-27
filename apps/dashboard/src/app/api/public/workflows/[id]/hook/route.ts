import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflows } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { normalizeTrigger, triggerNeedsSecret } from "@opendoor/shared";
import { ensureWorkflowSchema } from "@/lib/workflows/ensure-schema";
import { dispatchWorkflowTrigger, secretsEqual, triggerSecretFromRequest } from "@/lib/workflows/dispatch";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await params;
  await ensureWorkflowSchema();
  const secret = triggerSecretFromRequest(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const db = getDb();
  const [item] = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const trigger = normalizeTrigger(item.trigger);
  if (!triggerNeedsSecret(trigger.type) || !secretsEqual(item.webhookSecret, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = typeof body.query === "string" ? body.query : typeof body.text === "string" ? body.text : undefined;
  const result = await dispatchWorkflowTrigger({
    workflow: item,
    organizationId: item.organizationId,
    triggerType: trigger.type,
    requirePublished: true,
    input: { query, payload: body },
  });

  if ("error" in result && result.status) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
