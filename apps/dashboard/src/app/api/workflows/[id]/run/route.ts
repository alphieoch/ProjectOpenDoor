import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflowRuns, workflows } from "@opendoor/database";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { graphHasWebSearch, type WorkflowGraph, type WorkflowStepResult } from "@/lib/workflows/execute";
import { WebSearchNotConfiguredError, WebSearchProviderError } from "@/lib/web-search";
import { loadWebSearchEntitlement, webSearchAddonRequiredResponse } from "@/lib/web-search/entitlement";
import { ensureWorkflowSchema } from "@/lib/workflows/ensure-schema";
import { executeAndPersist, persistWorkflowRun } from "@/lib/workflows/runner";
import { graphForLiveRun } from "@opendoor/shared";

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
      .limit(40);
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
  const id = await workflowId(params);
  await ensureWorkflowSchema();

  let body: {
    query?: unknown;
    max_results?: unknown;
    runId?: unknown;
    decision?: unknown;
    resume?: unknown;
    published?: unknown;
    payload?: unknown;
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

  const usePublished = body.published === true;
  const graph = (
    usePublished
      ? graphForLiveRun({
          graph: item.graph,
          publishedGraph: item.publishedGraph,
          publishedVersion: item.publishedVersion,
        })
      : (item.graph || { nodes: [], edges: [] })
  ) as WorkflowGraph;

  if (graphHasWebSearch(graph)) {
    const addon = await loadWebSearchEntitlement(orgId, session);
    if (!addon.active) {
      return NextResponse.json(webSearchAddonRequiredResponse(addon), { status: 402 });
    }
  }

  const query = typeof body.query === "string" ? body.query : undefined;
  const maxResults = typeof body.max_results === "number" ? body.max_results : undefined;
  const payload = body.payload && typeof body.payload === "object" ? body.payload as Record<string, unknown> : undefined;
  const decision =
    body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  const resumeId = typeof body.runId === "string" ? body.runId : undefined;
  const resumeWait = body.resume === true;

  if ((decision || resumeWait) && resumeId) {
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

    const prior = (Array.isArray(existing?.stepOutputs) ? existing!.stepOutputs : []) as WorkflowStepResult[];
    const storedInput = (existing?.input || {}) as { query?: string; maxResults?: number; payload?: Record<string, unknown> };
    const input = {
      query: storedInput.query,
      maxResults: storedInput.maxResults,
      payload: storedInput.payload,
    };

    if (decision) {
      if (!existing || existing.status !== "awaiting_review") {
        return NextResponse.json({ error: "No run is awaiting review." }, { status: 409 });
      }
      const pause = [...prior].reverse().find((s) => s.type === "human_review" && s.status === "awaiting_review");
      if (!pause) {
        return NextResponse.json({ error: "No human_review step is awaiting review." }, { status: 409 });
      }

      if (decision === "reject") {
        pause.status = "error";
        pause.error = "Rejected";
        const run = await persistWorkflowRun({
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
        const { executed, run, status } = await executeAndPersist({
          workflow: item,
          organizationId: orgId,
          input,
          triggerType: existing.triggerType || "manual",
          usePublished: Boolean(existing.version),
          runId: existing.id,
          executeOpts: {
            resumeAfterNodeId: pause.nodeId.includes("/") ? pause.nodeId.split("/").pop() : pause.nodeId,
            initialText: pause.text,
            existingSteps: prior,
          },
        });
        await logAuditEvent({
          organizationId: orgId,
          userId: session.sub as string,
          action: "workflow.reviewed" as any,
          entityType: "workflow",
          entityId: item.id,
          metadata: { runId: existing.id, decision: "approve", status, steps: executed.steps.length },
        });
        return NextResponse.json({
          workflowId: item.id,
          runId: run?.id ?? existing.id,
          status,
          awaitingReview: status === "awaiting_review",
          awaitingWait: status === "awaiting_wait",
          steps: executed.steps,
          search: executed.search,
          assignedTo: executed.assignedTo,
          dueAt: executed.dueAt,
          vars: executed.vars,
          error: status === "failed" ? executed.steps.find((s) => s.status === "error")?.error : undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Workflow run failed";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    if (!existing || existing.status !== "awaiting_wait") {
      return NextResponse.json({ error: "No run is awaiting a wait timer." }, { status: 409 });
    }
    const pause = [...prior].reverse().find((s) => s.type === "wait" && s.status === "awaiting_wait");
    if (!pause) {
      return NextResponse.json({ error: "No wait step is awaiting resume." }, { status: 409 });
    }
    if (existing.resumeAt && new Date(existing.resumeAt).getTime() > Date.now()) {
      return NextResponse.json({ error: "Wait timer has not elapsed yet.", resumeAt: existing.resumeAt }, { status: 409 });
    }
    pause.status = "ok";
    pause.error = undefined;
    try {
      const { executed, run, status } = await executeAndPersist({
        workflow: item,
        organizationId: orgId,
        input,
        triggerType: existing.triggerType || "manual",
        usePublished: Boolean(existing.version),
        runId: existing.id,
        executeOpts: {
          resumeAfterNodeId: pause.nodeId.includes("/") ? pause.nodeId.split("/").pop() : pause.nodeId,
          initialText: pause.text,
          existingSteps: prior,
        },
      });
      return NextResponse.json({
        workflowId: item.id,
        runId: run?.id ?? existing.id,
        status,
        awaitingReview: status === "awaiting_review",
        awaitingWait: status === "awaiting_wait",
        steps: executed.steps,
        search: executed.search,
        assignedTo: executed.assignedTo,
        dueAt: executed.dueAt,
        vars: executed.vars,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Workflow run failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const input = { query, maxResults, payload };
  try {
    const { executed, run, status } = await executeAndPersist({
      workflow: item,
      organizationId: orgId,
      input,
      triggerType: "manual",
      usePublished,
    });

    await logAuditEvent({
      organizationId: orgId,
      userId: session.sub as string,
      action: "workflow.ran" as any,
      entityType: "workflow",
      entityId: item.id,
      metadata: {
        steps: executed.steps.length,
        failed: executed.steps.filter((s) => s.status === "error").length,
        provider: executed.search?.provider,
        runId: run?.id,
        status,
        published: usePublished,
      },
    });

    const failed = executed.steps.filter((s) => s.status === "error");
    return NextResponse.json({
      workflowId: item.id,
      runId: run?.id,
      status,
      awaitingReview: status === "awaiting_review",
      awaitingWait: status === "awaiting_wait",
      steps: executed.steps,
      search: executed.search,
      assignedTo: executed.assignedTo,
      dueAt: executed.dueAt,
      vars: executed.vars,
      error: failed.length && status === "failed" ? failed[0].error : undefined,
    }, {
      status: status === "failed" && !executed.search && !executed.paused && !executed.steps.some((s) => s.status === "ok")
        ? 502
        : 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Workflow run failed";
    if (err instanceof WebSearchNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof WebSearchProviderError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
