import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflowRuns, workflows } from "@opendoor/database";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  executeWorkflowGraph,
  graphHasWebSearch,
  type WorkflowGraph,
  type WorkflowStepResult,
} from "@/lib/workflows/execute";
import { WebSearchNotConfiguredError, WebSearchProviderError } from "@/lib/web-search";
import { loadWebSearchEntitlement, webSearchAddonRequiredResponse } from "@/lib/web-search/entitlement";
import { workflowGatewayContext } from "@/lib/workflows/gateway";

function runFinished(status: string): boolean {
  return status !== "running" && status !== "awaiting_review";
}

async function persistRun(opts: {
  id?: string;
  workflowId: string;
  organizationId: string;
  status: string;
  input: Record<string, unknown>;
  stepOutputs: WorkflowStepResult[];
  error?: string | null;
}) {
  const db = getDb();
  const completedAt = runFinished(opts.status) ? new Date() : null;
  try {
    if (opts.id) {
      const [row] = await db
        .update(workflowRuns)
        .set({
          status: opts.status,
          stepOutputs: opts.stepOutputs,
          error: opts.error ?? null,
          completedAt,
        })
        .where(and(eq(workflowRuns.id, opts.id), eq(workflowRuns.organizationId, opts.organizationId)))
        .returning();
      return row ?? null;
    }
    const [row] = await db
      .insert(workflowRuns)
      .values({
        workflowId: opts.workflowId,
        organizationId: opts.organizationId,
        status: opts.status,
        input: opts.input,
        stepOutputs: opts.stepOutputs,
        error: opts.error ?? null,
        completedAt,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    console.error("workflow_runs persist failed", err);
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;

  const db = getDb();
  const [item] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
    .limit(1);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const runs = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.workflowId, id), eq(workflowRuns.organizationId, orgId)))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(20);
    return NextResponse.json({ runs });
  } catch (err) {
    console.error("workflow_runs list failed", err);
    return NextResponse.json({ runs: [] });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;

  let body: {
    query?: unknown;
    max_results?: unknown;
    runId?: unknown;
    decision?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const db = getDb();
  const [item] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
    .limit(1);

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const graph = item.graph as WorkflowGraph;
  if (graphHasWebSearch(graph)) {
    const addon = await loadWebSearchEntitlement(orgId, session);
    if (!addon.active) {
      return NextResponse.json(webSearchAddonRequiredResponse(addon), { status: 402 });
    }
  }

  const query = typeof body.query === "string" ? body.query : undefined;
  const maxResults = typeof body.max_results === "number" ? body.max_results : undefined;
  const decision =
    body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  const resumeId = typeof body.runId === "string" ? body.runId : undefined;

  if (decision && resumeId) {
    let existing: typeof workflowRuns.$inferSelect | undefined;
    try {
      const rows = await db
        .select()
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.id, resumeId),
            eq(workflowRuns.workflowId, item.id),
            eq(workflowRuns.organizationId, orgId)
          )
        )
        .limit(1);
      existing = rows[0];
    } catch (err) {
      console.error("workflow_runs resume load failed", err);
      return NextResponse.json({ error: "Could not load the paused run." }, { status: 500 });
    }
    if (!existing || existing.status !== "awaiting_review") {
      return NextResponse.json({ error: "No run is awaiting review." }, { status: 409 });
    }

    const prior = (Array.isArray(existing.stepOutputs) ? existing.stepOutputs : []) as WorkflowStepResult[];
    const pause = [...prior].reverse().find((s) => s.type === "human_review" && s.status === "awaiting_review");
    if (!pause) {
      return NextResponse.json({ error: "No human_review step is awaiting review." }, { status: 409 });
    }

    const storedInput = (existing.input || {}) as { query?: string; maxResults?: number };
    const input = {
      query: storedInput.query,
      maxResults: storedInput.maxResults,
    };

    if (decision === "reject") {
      pause.status = "error";
      pause.error = "Rejected";
      const run = await persistRun({
        id: existing.id,
        workflowId: item.id,
        organizationId: orgId,
        status: "rejected",
        input,
        stepOutputs: prior,
        error: "Rejected",
      });
      await logAuditEvent({
        organizationId: orgId,
        userId: session.sub as string,
        action: "workflow.reviewed" as any,
        entityType: "workflow",
        entityId: item.id,
        metadata: { runId: existing.id, decision: "reject" },
      });
      return NextResponse.json({
        workflowId: item.id,
        runId: run?.id ?? existing.id,
        status: "rejected",
        steps: prior,
        error: "Rejected",
      });
    }

    pause.status = "ok";
    pause.error = undefined;

    try {
      const { steps, search, paused } = await executeWorkflowGraph(
        graph,
        input,
        workflowGatewayContext(orgId),
        {
          resumeAfterNodeId: pause.nodeId,
          initialText: pause.text,
          existingSteps: prior,
        }
      );
      const failed = steps.filter((s) => s.status === "error");
      const runStatus = paused ? "awaiting_review" : failed.length ? "failed" : "completed";
      const run = await persistRun({
        id: existing.id,
        workflowId: item.id,
        organizationId: orgId,
        status: runStatus,
        input,
        stepOutputs: steps,
        error: paused ? (steps.find((s) => s.status === "awaiting_review")?.error ?? null) : failed[0]?.error ?? null,
      });
      await logAuditEvent({
        organizationId: orgId,
        userId: session.sub as string,
        action: "workflow.reviewed" as any,
        entityType: "workflow",
        entityId: item.id,
        metadata: {
          runId: existing.id,
          decision: "approve",
          status: runStatus,
          steps: steps.length,
        },
      });
      return NextResponse.json({
        workflowId: item.id,
        runId: run?.id ?? existing.id,
        status: runStatus,
        awaitingReview: Boolean(paused),
        steps,
        search,
        error: failed.length && !paused ? failed[0].error : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Workflow run failed";
      await persistRun({
        id: existing.id,
        workflowId: item.id,
        organizationId: orgId,
        status: "failed",
        input,
        stepOutputs: prior,
        error: message,
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const input = { query, maxResults };
  const started = await persistRun({
    workflowId: item.id,
    organizationId: orgId,
    status: "running",
    input,
    stepOutputs: [],
  });

  try {
    const { steps, search, paused } = await executeWorkflowGraph(graph, input, workflowGatewayContext(orgId));

    const failed = steps.filter((s) => s.status === "error");
    const runStatus = paused ? "awaiting_review" : failed.length ? "failed" : "completed";
    const run = await persistRun({
      id: started?.id,
      workflowId: item.id,
      organizationId: orgId,
      status: runStatus,
      input,
      stepOutputs: steps,
      error: paused
        ? (steps.find((s) => s.status === "awaiting_review")?.error ?? null)
        : failed[0]?.error ?? null,
    });

    await logAuditEvent({
      organizationId: orgId,
      userId: session.sub as string,
      action: "workflow.ran" as any,
      entityType: "workflow",
      entityId: item.id,
      metadata: {
        steps: steps.length,
        failed: failed.length,
        provider: search?.provider,
        runId: run?.id,
        status: runStatus,
      },
    });

    return NextResponse.json({
      workflowId: item.id,
      runId: run?.id ?? started?.id,
      status: runStatus,
      awaitingReview: Boolean(paused),
      steps,
      search,
      error: failed.length && !paused ? failed[0].error : undefined,
    }, { status: failed.length && !search && !paused && !steps.some((s) => s.status === "ok") ? 502 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Workflow run failed";
    await persistRun({
      id: started?.id,
      workflowId: item.id,
      organizationId: orgId,
      status: "failed",
      input,
      stepOutputs: [],
      error: message,
    });
    if (err instanceof WebSearchNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof WebSearchProviderError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
