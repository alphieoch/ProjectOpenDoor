import { describe, expect, test } from "bun:test";
import { executeWorkflowGraph, type WorkflowGraph } from "./execute";

const gateway = {
  organizationId: "org",
  url: "",
  headers: {},
  configured: false,
};

function graph(nodes: WorkflowGraph["nodes"], edges: WorkflowGraph["edges"] = []): WorkflowGraph {
  return { nodes, edges };
}

describe("workflow engine steps", () => {
  test("transform interpolates variables and prior text", async () => {
    const result = await executeWorkflowGraph(
      graph([
        { id: "in", type: "input", data: {} },
        { id: "t", type: "transform", data: { template: "Hi {{vars.name}}: {{input}}" } },
        { id: "out", type: "output" },
      ], [
        { source: "in", target: "t" },
        { source: "t", target: "out" },
      ]),
      { query: "ticket" },
      gateway,
      { variables: { name: "Ada" }, sleep: async () => undefined }
    );
    expect(result.steps.find((s) => s.nodeId === "t")?.text).toBe("Hi Ada: ticket");
    expect(result.steps.at(-1)?.text).toBe("Hi Ada: ticket");
  });

  test("set_variable and assign update runtime context", async () => {
    const result = await executeWorkflowGraph(
      graph([
        { id: "v", type: "set_variable", data: { name: "queue", value: "billing" } },
        { id: "a", type: "assign", data: { queue: "{{vars.queue}}" } },
      ]),
      { query: "x" },
      gateway,
      { sleep: async () => undefined }
    );
    expect(result.vars.queue).toBe("billing");
    expect(result.assignedTo).toBe("billing");
    expect(result.steps.find((s) => s.nodeId === "a")?.assignedTo).toBe("billing");
  });

  test("loop maps newline items through a template", async () => {
    const result = await executeWorkflowGraph(
      graph([{ id: "l", type: "loop", data: { items: "a\nb\nc", template: "#{{index}}-{{item}}", join: "," } }]),
      undefined,
      gateway,
      { sleep: async () => undefined }
    );
    expect(result.steps[0].items).toBe(3);
    expect(result.steps[0].text).toBe("#0-a,#1-b,#2-c");
  });

  test("short wait completes and long wait pauses", async () => {
    const short = await executeWorkflowGraph(
      graph([{ id: "w", type: "wait", data: { waitSeconds: 0 } }]),
      { query: "go" },
      gateway,
      { sleep: async () => undefined }
    );
    expect(short.steps[0].status).toBe("ok");
    expect(short.paused).toBeUndefined();

    const now = new Date("2026-08-20T12:00:00.000Z");
    const long = await executeWorkflowGraph(
      graph([{ id: "w", type: "wait", data: { waitMinutes: 5 } }]),
      { query: "go" },
      gateway,
      { now, sleep: async () => undefined }
    );
    expect(long.paused?.reason).toBe("wait");
    expect(long.resumeAt).toBe("2026-08-20T12:05:00.000Z");
    expect(long.steps[0].status).toBe("awaiting_wait");
  });

  test("human_review records SLA and assignee", async () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const result = await executeWorkflowGraph(
      graph([{ id: "h", type: "human_review", data: { dueMinutes: 45, assignee: "lee", reviewNote: "Check {{input}}" } }]),
      { query: "claim" },
      gateway,
      { now, sleep: async () => undefined }
    );
    expect(result.paused?.reason).toBe("review");
    expect(result.assignedTo).toBe("lee");
    expect(result.dueAt).toBe("2026-08-20T12:45:00.000Z");
    expect(result.steps[0].error).toBe("Check claim");
  });

  test("onError fail halts the graph", async () => {
    const result = await executeWorkflowGraph(
      graph([
        { id: "a", type: "assign", data: { onError: "fail" } },
        { id: "b", type: "output" },
      ]),
      { query: "x" },
      gateway,
      { sleep: async () => undefined }
    );
    expect(result.halted).toBe(true);
    expect(result.steps.some((s) => s.nodeId === "b")).toBe(false);
  });

  test("http retries then succeeds", async () => {
    let calls = 0;
    const result = await executeWorkflowGraph(
      graph([{
        id: "h",
        type: "http",
        data: { url: "https://example.com/hook", method: "POST", retryCount: 2, retryDelayMs: 0 },
      }]),
      { query: "payload" },
      gateway,
      {
        sleep: async () => undefined,
        fetchHttp: async () => {
          calls += 1;
          if (calls < 3) throw new Error("down");
          return new Response("ok", { status: 200 });
        },
      }
    );
    expect(calls).toBe(3);
    expect(result.steps[0].status).toBe("ok");
    expect(result.steps[0].attempt).toBe(3);
    expect(result.steps[0].text).toBe("ok");
  });

  test("subflow executes a published child graph", async () => {
    const result = await executeWorkflowGraph(
      graph([
        { id: "s", type: "subflow", data: { workflowId: "child-1" } },
        { id: "out", type: "output" },
      ]),
      { query: "root" },
      gateway,
      {
        sleep: async () => undefined,
        resolveSubflow: async (id) =>
          id === "child-1"
            ? { name: "Child", graph: graph([{ id: "t", type: "transform", data: { template: "child:{{input}}" } }]) }
            : null,
      }
    );
    expect(result.steps.find((s) => s.nodeId === "s/t")?.text).toBe("child:root");
    expect(result.steps.at(-1)?.text).toBe("child:root");
  });

  test("condition still skips the false branch", async () => {
    const result = await executeWorkflowGraph(
      graph([
        { id: "c", type: "condition", data: { condition: 'includes("yes")' } },
        { id: "yes", type: "transform", data: { template: "taken" } },
        { id: "no", type: "transform", data: { template: "skipped" } },
      ], [
        { source: "c", target: "yes", sourceHandle: "true" },
        { source: "c", target: "no", sourceHandle: "false" },
      ]),
      { query: "yes please" },
      gateway,
      { sleep: async () => undefined }
    );
    expect(result.steps.find((s) => s.nodeId === "yes")?.status).toBe("ok");
    expect(result.steps.find((s) => s.nodeId === "no")?.status).toBe("skipped");
  });
});
