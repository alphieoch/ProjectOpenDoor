import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { AGENT_PUBLIC_ROUTES } from "../lib/agent-public.js";
import { PLATFORM_ENDPOINTS } from "./catalog.js";
import agentsRouter from "./agents.js";

describe("gateway /v1/agents auth", () => {
  const app = new Hono().route("/v1/agents", agentsRouter);

  test("list / create / restore reject a missing tenant", async () => {
    const list = await app.request("/v1/agents");
    const create = await app.request("/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Desk", runtime: "openbot", modelId: "deepseek-v3" }),
    });
    const restore = await app.request("/v1/agents/68de3f2c-8937-42ec-9fdd-b7a8e1c2d3e4/restore", {
      method: "POST",
    });
    expect(list.status).toBe(401);
    expect(create.status).toBe(401);
    expect(restore.status).toBe(401);
    expect(await list.json()).toEqual({ error: "Unauthorized" });
  });

  test("catalog includes every public agent route", () => {
    const catalog = new Set(PLATFORM_ENDPOINTS.map((e) => `${e.method} ${e.path}`));
    for (const route of AGENT_PUBLIC_ROUTES) {
      expect(catalog.has(`${route.method} ${route.path}`)).toBe(true);
    }
  });
});
