import { db, organizations } from "@opendoor/database";
import { eq, sql } from "drizzle-orm";
import { SEARCH_TOOL_ID, WEB_SEARCH_ADDON, workspaceHasWebSearchAddon } from "@opendoor/shared";
import { orgHasToolEnabled } from "./tool-entitlement.js";

const g = global as typeof global & { _webSearchAddonColsReady?: boolean };

export async function ensureWebSearchAddonColumns() {
  if (g._webSearchAddonColsReady) return;
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS web_search_addon_status varchar(50) NOT NULL DEFAULT 'inactive'`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_web_search_subscription_id varchar(255)`);
  g._webSearchAddonColsReady = true;
}

export async function webSearchAccess(
  orgId: string,
  plan?: string | null
): Promise<{ ok: boolean; via: "addon" | "usage" | null }> {
  await ensureWebSearchAddonColumns();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { plan: true, webSearchAddonStatus: true },
  });
  if (
    workspaceHasWebSearchAddon({
      plan: org?.plan ?? plan,
      webSearchAddonStatus: org?.webSearchAddonStatus,
    })
  ) {
    return { ok: true, via: "addon" };
  }
  if (
    (await orgHasToolEnabled(orgId, "web_search")) ||
    (await orgHasToolEnabled(orgId, SEARCH_TOOL_ID))
  ) {
    return { ok: true, via: "usage" };
  }
  return { ok: false, via: null };
}

export async function orgHasWebSearchAddon(orgId: string, plan?: string | null) {
  return (await webSearchAccess(orgId, plan)).ok;
}

export function webSearchAddonRequiredBody() {
  return {
    error: `OpenDoor Search is metered on credits, or a $${WEB_SEARCH_ADDON.amountUsd}/month add-on. Enable it on Tools or subscribe on Billing.`,
    code: "addon_required" as const,
    addon: "web_search" as const,
    amountUsd: WEB_SEARCH_ADDON.amountUsd,
  };
}
