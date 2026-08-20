import { describe, expect, test } from "bun:test";
import {
  AGENT_PUBLIC_ROUTES,
  agentKind,
  isAgentId,
  isLeaderbotName,
  isLeaderbotRecord,
  planAgentCaps,
  presentDeletedAgent,
  resolveCreateKind,
  spawnCapError,
} from "./agent-public.js";

describe("gateway agent public contract", () => {
  test("lists the dashboard-parity routes and never mounts computer CDP", () => {
    const paths = AGENT_PUBLIC_ROUTES.map((r) => `${r.method} ${r.path}`);
    expect(paths).toEqual([
      "GET /v1/agents",
      "POST /v1/agents",
      "GET /v1/agents/:id",
      "PATCH /v1/agents/:id",
      "POST /v1/agents/:id/chat",
      "POST /v1/agents/:id/ag-ui",
      "POST /v1/agents/:id/restore",
      "DELETE /v1/agents/:id",
    ]);
    expect(paths.some((p) => p.includes("/computer"))).toBe(false);
  });

  test("accepts workspace agent ids and rejects junk", () => {
    expect(isAgentId("68de3f2c-8937-42ec-9fdd-b7a8e1c2d3e4")).toBe(true);
    expect(isAgentId("does-not-exist")).toBe(false);
    expect(isAgentId("")).toBe(false);
  });

  test("classifies Leaderbot vs coworker", () => {
    expect(isLeaderbotName("Leaderbot")).toBe(true);
    expect(isLeaderbotRecord({ name: "Research", config: { kind: "leader" } })).toBe(true);
    expect(resolveCreateKind("Desk", "coworker")).toBe("coworker");
    expect(resolveCreateKind("Leaderbot", undefined)).toBe("leader");
    expect(agentKind({ name: "Leaderbot", runtime: "openbot", config: {} })).toBe("leader");
    expect(agentKind({ name: "Research", runtime: "openbot", config: {} })).toBe("coworker");
    expect(agentKind({ name: "Hermes", runtime: "hermes", config: {} })).toBe(null);
  });

  test("enforces plan seat caps the same way as the dashboard spawn gate", () => {
    expect(planAgentCaps("free")).toEqual({
      plan: "free",
      maxBots: 3,
      maxConcurrentAgents: 1,
    });
    expect(spawnCapError({ action: "create", bots: 3, running: 0, plan: "free" })?.code).toBe("at_bot_cap");
    expect(spawnCapError({ action: "start", bots: 1, running: 1, plan: "free" })?.code).toBe("at_concurrent_cap");
    expect(spawnCapError({ action: "create", bots: 0, running: 0, plan: "enterprise" })).toBeNull();
  });

  test("deleted agents expose a 7-day recoverUntil", () => {
    const deletedAt = new Date("2026-08-13T00:00:00.000Z");
    const presented = presentDeletedAgent({ id: "a", name: "Desk", deletedAt });
    expect(presented?.recoverUntil).toBe("2026-08-20T00:00:00.000Z");
    expect(presented?.daysLeft).toBeGreaterThanOrEqual(0);
  });
});
