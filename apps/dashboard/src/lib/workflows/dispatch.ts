import { timingSafeEqual } from "crypto";
import { graphHasWebSearch, type WorkflowGraph } from "@/lib/workflows/execute";
import { executeAndPersist } from "@/lib/workflows/runner";
import { graphForLiveRun, normalizeTrigger, triggerMatchesEvent, type WorkflowTriggerType } from "@opendoor/shared";
import type { WorkflowRow } from "@/lib/workflows/runner";

export function secretsEqual(expected: string | null | undefined, provided: string | null | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function triggerSecretFromRequest(req: { headers: Headers; url: string }): string {
  const header = req.headers.get("x-workflow-secret") || "";
  if (header.trim()) return header.trim();
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const url = new URL(req.url);
  return (url.searchParams.get("secret") || "").trim();
}

export async function dispatchWorkflowTrigger(opts: {
  workflow: WorkflowRow;
  organizationId: string;
  triggerType: WorkflowTriggerType;
  input: { query?: string; maxResults?: number; payload?: Record<string, unknown> };
  requirePublished?: boolean;
}) {
  const trigger = normalizeTrigger(opts.workflow.trigger);
  if (opts.requirePublished && (opts.workflow.publishedVersion || 0) < 1) {
    return { error: "Publish this workflow before firing live triggers.", status: 409 as const };
  }
  if (opts.requirePublished && opts.workflow.status !== "active") {
    return { error: "Only active published workflows accept live triggers.", status: 409 as const };
  }
  if (!triggerMatchesEvent(trigger, opts.input.payload || {})) {
    return { error: "Trigger event does not match this workflow.", status: 422 as const };
  }

  const graph = graphForLiveRun({
    graph: opts.workflow.graph,
    publishedGraph: opts.workflow.publishedGraph,
    publishedVersion: opts.workflow.publishedVersion,
  }) as WorkflowGraph;
  if (graphHasWebSearch(graph)) {
    return { error: "Web-search workflows must be run from the signed-in editor so billing can be checked.", status: 402 as const };
  }

  const { executed, run, status } = await executeAndPersist({
    workflow: opts.workflow,
    organizationId: opts.organizationId,
    input: opts.input,
    triggerType: opts.triggerType,
    usePublished: opts.requirePublished !== false,
  });

  return {
    workflowId: opts.workflow.id,
    runId: run?.id,
    status,
    awaitingReview: status === "awaiting_review",
    awaitingWait: status === "awaiting_wait",
    steps: executed.steps,
    assignedTo: executed.assignedTo,
    dueAt: executed.dueAt,
    vars: executed.vars,
    error: status === "failed" ? executed.steps.find((s) => s.status === "error")?.error : undefined,
  };
}
