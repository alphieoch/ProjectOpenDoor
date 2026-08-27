import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workflowRuns, workflows } from "@opendoor/database";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { nextCronRun, normalizeTrigger, slaBreached } from "@opendoor/shared";
import { ensureWorkflowSchema } from "@/lib/workflows/ensure-schema";
import { dispatchWorkflowTrigger } from "@/lib/workflows/dispatch";
import { executeAndPersist } from "@/lib/workflows/runner";
import type { WorkflowStepResult } from "@/lib/workflows/execute";

export async function POST() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  await ensureWorkflowSchema();

  const db = getDb();
  const now = new Date();
  const resumed: string[] = [];
  const started: string[] = [];
  const sla: string[] = [];

  const dueWaits = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.organizationId, orgId),
        eq(workflowRuns.status, "awaiting_wait"),
        isNotNull(workflowRuns.resumeAt),
        lte(workflowRuns.resumeAt, now)
      )
    )
    .limit(20);

  for (const run of dueWaits) {
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, run.workflowId), eq(workflows.organizationId, orgId)))
      .limit(1);
    if (!workflow) continue;
    const prior = (Array.isArray(run.stepOutputs) ? run.stepOutputs : []) as WorkflowStepResult[];
    const pause = [...prior].reverse().find((s) => s.type === "wait" && s.status === "awaiting_wait");
    if (!pause) continue;
    pause.status = "ok";
    pause.error = undefined;
    const stored = (run.input || {}) as { query?: string; maxResults?: number; payload?: Record<string, unknown> };
    await executeAndPersist({
      workflow,
      organizationId: orgId,
      input: stored,
      triggerType: run.triggerType || "schedule",
      usePublished: Boolean(run.version),
      runId: run.id,
      executeOpts: {
        resumeAfterNodeId: pause.nodeId.includes("/") ? pause.nodeId.split("/").pop() : pause.nodeId,
        initialText: pause.text,
        existingSteps: prior,
      },
    });
    resumed.push(run.id);
  }

  const overdue = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.organizationId, orgId),
        eq(workflowRuns.status, "awaiting_review"),
        isNotNull(workflowRuns.dueAt),
        lte(workflowRuns.dueAt, now)
      )
    )
    .limit(40);

  for (const run of overdue) {
    if (!slaBreached(run.dueAt, now)) continue;
    const prior = (Array.isArray(run.stepOutputs) ? run.stepOutputs : []) as WorkflowStepResult[];
    const pause = [...prior].reverse().find((s) => s.type === "human_review" && s.status === "awaiting_review");
    if (pause && !pause.error?.includes("SLA breached")) {
      pause.error = `${pause.error || "Awaiting review"} · SLA breached`;
    }
    await db
      .update(workflowRuns)
      .set({
        status: "sla_breached",
        stepOutputs: prior,
        error: pause?.error || "SLA breached",
      })
      .where(and(eq(workflowRuns.id, run.id), eq(workflowRuns.organizationId, orgId)));
    sla.push(run.id);
  }

  const dueSchedules = await db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.organizationId, orgId),
        eq(workflows.status, "active"),
        isNotNull(workflows.nextRunAt),
        lte(workflows.nextRunAt, now)
      )
    )
    .limit(10);

  for (const workflow of dueSchedules) {
    const trigger = normalizeTrigger(workflow.trigger);
    if (trigger.type !== "schedule" || !trigger.cron) continue;
    await dispatchWorkflowTrigger({
      workflow,
      organizationId: orgId,
      triggerType: "schedule",
      requirePublished: true,
      input: { query: "Scheduled run", payload: { trigger: "schedule" } },
    });
    const next = nextCronRun(trigger.cron, now);
    await db
      .update(workflows)
      .set({ nextRunAt: next, updatedAt: now })
      .where(and(eq(workflows.id, workflow.id), eq(workflows.organizationId, orgId)));
    started.push(workflow.id);
  }

  return NextResponse.json({
    ok: true,
    resumed: resumed.length,
    scheduled: started.length,
    slaBreached: sla.length,
    resumeIds: resumed,
    scheduledIds: started,
    slaIds: sla,
  });
}
