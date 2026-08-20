import { Hono } from "hono";
import { PLATFORM_TOOLS, formatToolCost } from "@opendoor/shared";
import { requireTenant } from "../lib/platform.js";
import { orgHasToolEnabled } from "../lib/tool-entitlement.js";

const toolsRouter = new Hono();

toolsRouter.get("/", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await Promise.all(
    PLATFORM_TOOLS.map(async (tool) => ({
      id: tool.id,
      object: "tool",
      name: tool.name,
      description: tool.description,
      endpoint: tool.endpoint,
      cost: formatToolCost(tool),
      enabled: await orgHasToolEnabled(tenant.organization.id, tool.id),
    }))
  );
  return c.json({ object: "list", data: rows });
});

export default toolsRouter;
