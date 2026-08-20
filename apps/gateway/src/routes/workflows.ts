import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, workflowRuns, workflowVersions, workflows } from "@opendoor/database";
import type { ChatMessage } from "@opendoor/shared";
import {
  evaluateCondition,
  graphForLiveRun,
  interpolate,
  nextPublishedVersion,
  normalizeTrigger,
  parseVariables,
} from "@opendoor/shared";
import { asString, requireTenant, writeAudit } from "../lib/platform.js";
import { runBilledChat } from "../lib/run-completion.js";
import { orgHasWebSearchAddon, webSearchAddonRequiredBody } from "../lib/web-search-entitlement.js";
import { runWebSearch } from "../lib/web-search.js";

const workflowsRouter = new Hono();

type GraphNode = { id: string; type?: string; data?: Record<string, unknown> };
type GraphEdge = { source?: string; target?: string; label?: string };
type Graph = { nodes?: GraphNode[]; edges?: GraphEdge[] };

type Step = {
  nodeId: string;
  type: string;
  status: "ok" | "error" | "skipped";
  text?: string;
  error?: string;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toolType(node: GraphNode): string {
  const data = node.data || {};
  return str(data.toolType) || str(data.tool) || node.type || "";
}

function topological(graph: Graph): GraphNode[] {
  const nodes = graph.nodes || [];
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, 0);
    outgoing.set(n.id, []);
  }
  for (const edge of graph.edges || []) {
    if (!edge.source || !edge.target) continue;
    if (!incoming.has(edge.target) || !outgoing.has(edge.source)) continue;
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const queue = nodes.filter((n) => (incoming.get(n.id) || 0) === 0);
  const ordered: GraphNode[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const node = queue.shift()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    ordered.push(node);
    for (const next of outgoing.get(node.id) || []) {
      incoming.set(next, (incoming.get(next) || 0) - 1);
      if ((incoming.get(next) || 0) === 0) {
        const found = nodes.find((n) => n.id === next);
        if (found) queue.push(found);
      }
    }
  }
  for (const node of nodes) if (!seen.has(node.id)) ordered.push(node);
  return ordered;
}

async function ownedWorkflow(id: string, orgId: string) {
  const [row] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

workflowsRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.organizationId, tenant.organization.id))
    .orderBy(desc(workflows.updatedAt));
  return c.json({ object: "list", data: rows });
});

workflowsRouter.post("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name);
  if (!name) return c.json({ error: "name is required" }, 400);
  const [created] = await db
    .insert(workflows)
    .values({
      organizationId: tenant.organization.id,
      name,
      description: asString(body.description) || null,
      category: asString(body.category) || "general",
      status: asString(body.status) || "draft",
      graph: body.graph ?? { nodes: [], edges: [] },
      tags: Array.isArray(body.tags) ? body.tags : [],
    })
    .returning();
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "workflow.created",
    entityType: "workflow",
    entityId: created.id,
    metadata: { name },
  });
  return c.json({ object: "workflow", ...created }, 201);
});

workflowsRouter.get("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const row = await ownedWorkflow(c.req.param("id"), tenant.organization.id);
  if (!row) return c.json({ error: "Workflow not found" }, 404);
  return c.json({ object: "workflow", ...row });
});

workflowsRouter.patch("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await ownedWorkflow(c.req.param("id"), tenant.organization.id);
  if (!existing) return c.json({ error: "Workflow not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const [updated] = await db
    .update(workflows)
    .set({
      name: asString(body.name) || existing.name,
      description: body.description !== undefined ? asString(body.description) || null : existing.description,
      category: asString(body.category) || existing.category,
      status: asString(body.status) || existing.status,
      graph: body.graph !== undefined ? body.graph : existing.graph,
      tags: Array.isArray(body.tags) ? body.tags : existing.tags,
      trigger: body.trigger !== undefined ? normalizeTrigger(body.trigger) : existing.trigger,
      variables: body.variables !== undefined ? parseVariables(body.variables) : existing.variables,
      updatedAt: new Date(),
    })
    .where(eq(workflows.id, existing.id))
    .returning();
  return c.json({ object: "workflow", ...updated });
});

workflowsRouter.delete("/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await ownedWorkflow(c.req.param("id"), tenant.organization.id);
  if (!existing) return c.json({ error: "Workflow not found" }, 404);
  await db.delete(workflows).where(eq(workflows.id, existing.id));
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "workflow.deleted",
    entityType: "workflow",
    entityId: existing.id,
  });
  return c.json({ object: "workflow.deleted", id: existing.id, deleted: true });
});

workflowsRouter.get("/:id/runs", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await ownedWorkflow(c.req.param("id"), tenant.organization.id);
  if (!existing) return c.json({ error: "Workflow not found" }, 404);
  const rows = await db
    .select()
    .from(workflowRuns)
    .where(
      and(eq(workflowRuns.workflowId, existing.id), eq(workflowRuns.organizationId, tenant.organization.id))
    )
    .orderBy(desc(workflowRuns.createdAt))
    .limit(50);
  return c.json({ object: "list", data: rows });
});

workflowsRouter.get("/:id/runs/:runId", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [row] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, c.req.param("runId")),
        eq(workflowRuns.workflowId, c.req.param("id")),
        eq(workflowRuns.organizationId, tenant.organization.id)
      )
    )
    .limit(1);
  if (!row) return c.json({ error: "Run not found" }, 404);
  return c.json({ object: "workflow.run", ...row });
});

workflowsRouter.post("/:id/run", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const workflow = await ownedWorkflow(c.req.param("id"), tenant.organization.id);
  if (!workflow) return c.json({ error: "Workflow not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const input = (body.input && typeof body.input === "object" ? body.input : body) as Record<string, unknown>;
  const graph = graphForLiveRun({
    graph: workflow.graph,
    publishedGraph: workflow.publishedGraph,
    publishedVersion: workflow.publishedVersion,
  }) as Graph;
  const query = str(input.query) || str(input.prompt) || str(input.text) || "";
  const vars = parseVariables(workflow.variables);

  const hasSearch = (graph.nodes || []).some((n) => {
    const t = toolType(n);
    return t === "web_search" || n.type === "web_search";
  });
  if (hasSearch && !(await orgHasWebSearchAddon(tenant.organization.id, tenant.organization.plan))) {
    return c.json(webSearchAddonRequiredBody(), 402);
  }

  const steps: Step[] = [];
  let lastText = query;
  let failed = false;

  for (const node of topological(graph)) {
    const type = toolType(node) || node.type || "unknown";
    if (type === "input" || type === "output" || type === "start" || type === "end") {
      steps.push({ nodeId: node.id, type, status: "ok", text: lastText });
      continue;
    }
    if (type === "web_search") {
      const q = str(node.data?.query) || lastText;
      try {
        const result = await runWebSearch(q, 5);
        lastText = (result.results || []).map((r) => `${r.title}: ${r.snippet || r.url}`).join("\n");
        steps.push({ nodeId: node.id, type, status: "ok", text: lastText });
      } catch (err) {
        failed = true;
        steps.push({
          nodeId: node.id,
          type,
          status: "error",
          error: err instanceof Error ? err.message : "Web search failed",
        });
      }
      continue;
    }
    if (type === "llm" || type === "chat" || type === "generate" || type === "model") {
      const model = str(node.data?.modelId) || str(node.data?.model) || str(input.model) || "opendoor/auto";
      const prompt = str(node.data?.prompt) || lastText;
      const messages: ChatMessage[] = [{ role: "user", content: prompt }];
      try {
        const completion = await runBilledChat({
          organization: tenant.organization,
          apiKey: tenant.apiKey,
          model,
          messages,
          metadata: { workflow_id: workflow.id, node_id: node.id, source: "workflows.run" },
        });
        lastText = String(completion.choices[0]?.message.content || "");
        steps.push({ nodeId: node.id, type, status: "ok", text: lastText });
      } catch (err) {
        failed = true;
        steps.push({
          nodeId: node.id,
          type,
          status: "error",
          error: err instanceof Error ? err.message : "LLM step failed",
        });
      }
      continue;
    }
    if (type === "condition") {
      const expr = interpolate(str(node.data?.condition) || str(node.data?.contains) || str(node.data?.equals), {
        input: lastText,
        query: lastText,
        vars,
        steps: {},
      });
      const result = evaluateCondition(expr, lastText);
      const passed = result.ok ? result.passed : Boolean(lastText);
      steps.push({ nodeId: node.id, type, status: result.ok ? "ok" : "error", text: passed ? "true" : "false", error: result.ok ? undefined : result.error });
      continue;
    }
    if (type === "transform" || type === "set_variable") {
      const template = str(node.data?.template) || str(node.data?.value) || lastText;
      lastText = interpolate(template, { input: lastText, query: lastText, vars, steps: {} });
      const name = str(node.data?.name);
      if (name) vars[name] = lastText;
      steps.push({ nodeId: node.id, type, status: "ok", text: lastText });
      continue;
    }
    if (type === "assign" || type === "wait" || type === "loop" || type === "http" || type === "subflow" || type === "human_review") {
      steps.push({
        nodeId: node.id,
        type,
        status: "skipped",
        text: `Node type "${type}" runs on the dashboard engine (approvals, timers, HTTPS, subflows).`,
      });
      continue;
    }
    steps.push({
      nodeId: node.id,
      type,
      status: "skipped",
      text: `Node type "${type}" is recorded. Use the dashboard runner for code_execution / human_review.`,
    });
  }

  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId: workflow.id,
      organizationId: tenant.organization.id,
      status: failed ? "error" : "completed",
      input,
      stepOutputs: steps,
      error: failed ? steps.find((s) => s.status === "error")?.error || "Step failed" : null,
      completedAt: new Date(),
    })
    .returning();

  return c.json({ object: "workflow.run", ...run, output: lastText }, failed ? 502 : 200);
});

workflowsRouter.post("/:id/publish", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await ownedWorkflow(c.req.param("id"), tenant.organization.id);
  if (!existing) return c.json({ error: "Workflow not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const version = nextPublishedVersion(existing.publishedVersion);
  const now = new Date();
  const [updated] = await db
    .update(workflows)
    .set({
      publishedGraph: existing.graph,
      publishedVersion: version,
      publishedAt: now,
      status: existing.status === "archived" ? existing.status : "active",
      updatedAt: now,
    })
    .where(eq(workflows.id, existing.id))
    .returning();
  const [snapshot] = await db
    .insert(workflowVersions)
    .values({
      workflowId: existing.id,
      organizationId: tenant.organization.id,
      version,
      graph: existing.graph || { nodes: [], edges: [] },
      trigger: normalizeTrigger(existing.trigger),
      variables: parseVariables(existing.variables),
      note: asString(body.note) || null,
      publishedAt: now,
    })
    .returning();
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "workflow.published",
    entityType: "workflow",
    entityId: existing.id,
    metadata: { version },
  });
  return c.json({ object: "workflow", ...updated, version: snapshot });
});

workflowsRouter.get("/:id/versions", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await ownedWorkflow(c.req.param("id"), tenant.organization.id);
  if (!existing) return c.json({ error: "Workflow not found" }, 404);
  const rows = await db
    .select({
      id: workflowVersions.id,
      version: workflowVersions.version,
      note: workflowVersions.note,
      publishedAt: workflowVersions.publishedAt,
    })
    .from(workflowVersions)
    .where(
      and(eq(workflowVersions.workflowId, existing.id), eq(workflowVersions.organizationId, tenant.organization.id))
    )
    .orderBy(desc(workflowVersions.version))
    .limit(25);
  return c.json({ object: "list", data: rows });
});

workflowsRouter.post("/:id/trigger", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existing = await ownedWorkflow(c.req.param("id"), tenant.organization.id);
  if (!existing) return c.json({ error: "Workflow not found" }, 404);
  if ((existing.publishedVersion || 0) < 1) return c.json({ error: "Publish this workflow first." }, 409);
  return workflowsRouter.request(`/${existing.id}/run`, {
    method: "POST",
    headers: c.req.raw.headers,
    body: await c.req.raw.clone().text(),
  });
});

export default workflowsRouter;
