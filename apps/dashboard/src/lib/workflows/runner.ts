import { and, eq } from "drizzle-orm";
import { workflowRuns, workflows } from "@opendoor/database";
import {
  graphForLiveRun,
  parseVariables,
  type WorkflowTriggerType,
} from "@opendoor/shared";
import { getDb } from "@/lib/db";
import {
  executeWorkflowGraph,
  type ExecuteWorkflowOptions,
  type WorkflowGraph,
  type WorkflowStepResult,
} from "@/lib/workflows/execute";
import { workflowGatewayContext } from "@/lib/workflows/gateway";

export type WorkflowRow = typeof workflows.$inferSelect;

export function runFinished(status: string): boolean {
  return status !== "running" && status !== "awaiting_review" && status !== "awaiting_wait";
}

export async function persistWorkflowRun(opts: {
  id?: string;
  workflowId: string;
  organizationId: string;
  status: string;
  input: Record<string, unknown>;
  stepOutputs: WorkflowStepResult[];
  error?: string | null;
  triggerType?: string;
  version?: number | null;
  assignedTo?: string | null;
  dueAt?: Date | string | null;
  resumeAt?: Date | string | null;
  attempt?: number;
}) {
  const db = getDb();
  const completedAt = runFinished(opts.status) ? new Date() : null;
  const dueAt = opts.dueAt ? new Date(opts.dueAt) : null;
  const resumeAt = opts.resumeAt ? new Date(opts.resumeAt) : null;
  try {
    if (opts.id) {
      const [row] = await db
        .update(workflowRuns)
        .set({
          status: opts.status,
          stepOutputs: opts.stepOutputs,
          error: opts.error ?? null,
          assignedTo: opts.assignedTo ?? null,
          dueAt,
          resumeAt,
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
        triggerType: opts.triggerType || "manual",
        version: opts.version ?? null,
        assignedTo: opts.assignedTo ?? null,
        dueAt,
        resumeAt,
        attempt: opts.attempt ?? 1,
        completedAt,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    console.error("workflow_runs persist failed", err);
    return null;
  }
}

export async function resolvePublishedSubflow(
  organizationId: string,
  workflowId: string
): Promise<{ graph: WorkflowGraph; name?: string } | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.organizationId, organizationId)))
    .limit(1);
  if (!row || (row.publishedVersion || 0) < 1 || !row.publishedGraph) return null;
  return { graph: row.publishedGraph as WorkflowGraph, name: row.name };
}

export function statusFromExecution(result: {
  paused?: { reason?: string; dueAt?: string };
  halted?: boolean;
  steps: WorkflowStepResult[];
}): string {
  if (result.paused?.reason === "wait") return "awaiting_wait";
  if (result.paused) return "awaiting_review";
  if (result.halted || result.steps.some((s) => s.status === "error")) return "failed";
  return "completed";
}

export async function executeAndPersist(opts: {
  workflow: WorkflowRow;
  organizationId: string;
  input: { query?: string; maxResults?: number; payload?: Record<string, unknown> };
  triggerType?: WorkflowTriggerType | string;
  usePublished?: boolean;
  runId?: string;
  executeOpts?: ExecuteWorkflowOptions;
}) {
  const graph = (
    opts.usePublished
      ? graphForLiveRun({
          graph: opts.workflow.graph,
          publishedGraph: opts.workflow.publishedGraph,
          publishedVersion: opts.workflow.publishedVersion,
        })
      : (opts.workflow.graph || { nodes: [], edges: [] })
  ) as WorkflowGraph;

  const started = opts.runId
    ? { id: opts.runId }
    : await persistWorkflowRun({
        workflowId: opts.workflow.id,
        organizationId: opts.organizationId,
        status: "running",
        input: opts.input,
        stepOutputs: [],
        triggerType: opts.triggerType,
        version: opts.usePublished ? opts.workflow.publishedVersion : null,
      });

  try {
    const executed = await executeWorkflowGraph(
      graph,
      opts.input,
      workflowGatewayContext(opts.organizationId),
      {
        variables: parseVariables(opts.workflow.variables),
        payload: opts.input.payload,
        resolveSubflow: (id) => resolvePublishedSubflow(opts.organizationId, id),
        ...(opts.executeOpts || {}),
      }
    );
    const status = statusFromExecution(executed);
    const run = await persistWorkflowRun({
      id: started?.id,
      workflowId: opts.workflow.id,
      organizationId: opts.organizationId,
      status,
      input: opts.input,
      stepOutputs: executed.steps,
      error: executed.paused
        ? executed.steps.find((s) => s.status === "awaiting_review" || s.status === "awaiting_wait")?.error ?? null
        : executed.steps.find((s) => s.status === "error")?.error ?? null,
      triggerType: opts.triggerType,
      version: opts.usePublished ? opts.workflow.publishedVersion : null,
      assignedTo: executed.assignedTo,
      dueAt: executed.dueAt,
      resumeAt: executed.resumeAt,
    });
    return { executed, run, status, graph };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Workflow run failed";
    await persistWorkflowRun({
      id: started?.id,
      workflowId: opts.workflow.id,
      organizationId: opts.organizationId,
      status: "failed",
      input: opts.input,
      stepOutputs: opts.executeOpts?.existingSteps || [],
      error: message,
      triggerType: opts.triggerType,
    });
    throw err;
  }
}
