import { Hono } from "hono";
import {
  runWebSearch,
  WebSearchNotConfiguredError,
  WebSearchProviderError,
} from "../lib/web-search.js";
import { webSearchAccess, webSearchAddonRequiredBody } from "../lib/web-search-entitlement.js";
import { getPlatformTool, usageCostCents } from "@opendoor/shared";
import { centsToUsd, debitUsage, orgHasUnlimitedSpend } from "../utils/billing.js";

const pluginsRouter = new Hono();

function requireApiKey(c: { get: (k: "apiKey") => unknown }) {
  return c.get("apiKey") ?? null;
}

pluginsRouter.post("/web-search", async (c) => {
  if (!requireApiKey(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const organization = c.get("organization");
  const access = organization
    ? await webSearchAccess(organization.id, organization.plan)
    : { ok: false, via: null };
  if (!organization || !access.ok) {
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
    if (access.via === "usage" && !(await orgHasUnlimitedSpend(organization))) {
      const tool = getPlatformTool("web_search");
      const cents = tool ? usageCostCents(tool, 1) : 0;
      if (cents > 0) {
        await debitUsage(organization.id, centsToUsd(cents), undefined, {
          plan: organization.plan,
          family: "closed",
          providerSlug: "vertex",
          useFromPlan: false,
          useFromCredits: true,
        });
      }
    }
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
