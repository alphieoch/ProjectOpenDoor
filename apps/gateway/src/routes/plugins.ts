import { Hono } from "hono";
import {
  runWebSearch,
  WebSearchNotConfiguredError,
  WebSearchProviderError,
} from "../lib/web-search.js";
import { orgHasWebSearchAddon, webSearchAddonRequiredBody } from "../lib/web-search-entitlement.js";

const pluginsRouter = new Hono();

function requireApiKey(c: { get: (k: "apiKey") => unknown }) {
  return c.get("apiKey") ?? null;
}

pluginsRouter.post("/web-search", async (c) => {
  if (!requireApiKey(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const organization = c.get("organization");
  if (!organization || !(await orgHasWebSearchAddon(organization.id, organization.plan))) {
    return c.json(webSearchAddonRequiredBody(), 402);
  }

  let body: { query?: unknown; max_results?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body.query !== "string" || !body.query.trim()) {
    return c.json({ error: "query is required" }, 400);
  }

  const maxResults =
    typeof body.max_results === "number" ? body.max_results : undefined;

  try {
    const result = await runWebSearch(body.query, maxResults);
    return c.json(result);
  } catch (err) {
    if (err instanceof WebSearchNotConfiguredError) {
      return c.json({ error: err.message }, 503);
    }
    if (err instanceof WebSearchProviderError) {
      return c.json({ error: err.message }, 502);
    }
    const message = err instanceof Error ? err.message : "Web search failed";
    return c.json({ error: message }, 400);
  }
});

export { runWebSearch };
export default pluginsRouter;
