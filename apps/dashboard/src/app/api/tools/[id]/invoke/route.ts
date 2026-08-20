import { NextRequest, NextResponse } from "next/server";
import { getPlatformTool, isRagSearchToolId, usesWebSearchAddon } from "@opendoor/shared";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { chargeToolUsage, orgHasToolEnabled } from "@/lib/tools/entitlements";
import { invokeOpenDoorSearch } from "@/lib/tools/search-invoke";
import { loadWebSearchEntitlement } from "@/lib/web-search/entitlement";
import { executeWorkflowGraph, type WorkflowGraph } from "@/lib/workflows/execute";
import { workflowGatewayContext } from "@/lib/workflows/gateway";

function invokeGraph(toolId: string, body: Record<string, unknown>): WorkflowGraph {
  const data: Record<string, unknown> = { toolType: toolId };
  if (typeof body.query === "string") data.query = body.query;
  if (typeof body.prompt === "string") data.prompt = body.prompt;
  if (typeof body.code === "string") data.code = body.code;
  if (typeof body.language === "string") data.language = body.language;
  if (typeof body.fileId === "string") data.fileId = body.fileId;
  if (typeof body.file_id === "string") data.fileId = body.file_id;
  if (typeof body.model === "string") data.model = body.model;
  if (typeof body.modelId === "string") data.modelId = body.modelId;
  return {
    nodes: [{ id: "tool", type: "tool", data }],
    edges: [],
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  const tool = getPlatformTool(id);
  if (!tool) return NextResponse.json({ error: "Tool not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const query =
    typeof body.query === "string"
      ? body.query
      : typeof body.prompt === "string"
        ? body.prompt
        : undefined;

  if (isRagSearchToolId(id)) {
    const maxResults =
      typeof body.maxResults === "number"
        ? body.maxResults
        : typeof body.max_results === "number"
          ? body.max_results
          : undefined;
    const result = await invokeOpenDoorSearch({
      orgId,
      query: query ?? "",
      userId: sessionActorId(session),
      isSiteAdmin: session.isSiteAdmin,
      session,
      maxResults,
    });
    return NextResponse.json(result.body, { status: result.status });
  }

  const enabled = await orgHasToolEnabled(orgId, id);
  const addon = usesWebSearchAddon(tool) ? await loadWebSearchEntitlement(orgId, session) : null;
  if (!enabled && !addon?.active) {
    return NextResponse.json(
      { error: `Enable ${tool.name} on Tools first, or subscribe to the monthly add-on.` },
      { status: 402 }
    );
  }

  const afford = await chargeToolUsage({
    orgId,
    toolId: id,
    userId: sessionActorId(session),
    isSiteAdmin: session.isSiteAdmin,
    coveredByAddon: Boolean(addon?.active),
    dryRun: true,
  });
  if ("error" in afford) {
    return NextResponse.json({ error: afford.error }, { status: afford.status });
  }

  const { steps } = await executeWorkflowGraph(
    invokeGraph(id, body),
    { query },
    workflowGatewayContext(orgId)
  );
  const step = steps[0];
  if (!step || step.status === "error") {
    return NextResponse.json(
      { error: step?.error || "Tool failed", step, chargedCents: 0 },
      { status: step?.code === "not_configured" ? 503 : 502 }
    );
  }

  const charge = await chargeToolUsage({
    orgId,
    toolId: id,
    userId: sessionActorId(session),
    isSiteAdmin: session.isSiteAdmin,
    coveredByAddon: Boolean(addon?.active),
  });
  if ("error" in charge) {
    return NextResponse.json({ error: charge.error, step }, { status: charge.status });
  }

  return NextResponse.json({
    tool: tool.id,
    step,
    chargedCents: charge.chargedCents,
    unlimited: charge.unlimited,
  });
}
