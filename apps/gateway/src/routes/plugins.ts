import { Hono } from "hono";
import type { Context } from "hono";
import {
  ragSearch,
  RagSearchError,
  RagSearchNotConfiguredError,
} from "../lib/rag-search.js";
import { authorizeGatewaySearch, settleGatewaySearch } from "../lib/search-spend.js";
import { webSearchAddonRequiredBody } from "../lib/web-search-entitlement.js";

const pluginsRouter = new Hono();

function requireApiKey(c: { get: (k: "apiKey") => unknown }) {
  return c.get("apiKey") ?? null;
}

async function runOpenDoorSearch(c: Context) {
  if (!requireApiKey(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const organization = c.get("organization");
  if (!organization) {
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

  const gate = await authorizeGatewaySearch(organization);
  if (!gate.ok) {
    return c.json(gate.body, gate.status);
  }

  const maxResults =
    typeof body.max_results === "number" ? body.max_results : undefined;

  try {
    const result = await ragSearch({ query: body.query, orgId: organization.id, maxResults });
    await settleGatewaySearch(organization, gate.chargeCents);
    return c.json({
      query: result.query,
      provider: result.provider,
      answer: result.answer,
      results: result.citations,
      citations: result.citations,
    });
  } catch (err) {
    if (err instanceof RagSearchNotConfiguredError) {
      return c.json({ error: err.message }, 503);
    }
    if (err instanceof RagSearchError) {
      return c.json({ error: err.message }, err.status === 400 ? 400 : 502);
    }
    const message = err instanceof Error ? err.message : "Web search failed";
    return c.json({ error: message }, 400);
  }
}

pluginsRouter.post("/web-search", (c) => runOpenDoorSearch(c));
pluginsRouter.post("/search", (c) => runOpenDoorSearch(c));

export { ragSearch };
export default pluginsRouter;
