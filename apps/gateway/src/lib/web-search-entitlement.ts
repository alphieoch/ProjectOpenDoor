import { db, organizations } from "@opendoor/database";
import { eq, sql } from "drizzle-orm";
import { WEB_SEARCH_ADDON, workspaceHasWebSearchAddon } from "@opendoor/shared";

const g = global as typeof global & { _webSearchAddonColsReady?: boolean };

export async function ensureWebSearchAddonColumns() {
  if (g._webSearchAddonColsReady) return;
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS web_search_addon_status varchar(50) NOT NULL DEFAULT 'inactive'`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_web_search_subscription_id varchar(255)`);
  g._webSearchAddonColsReady = true;
}

export async function orgHasWebSearchAddon(orgId: string, plan?: string | null) {
  await ensureWebSearchAddonColumns();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { plan: true, webSearchAddonStatus: true },
  });
  return workspaceHasWebSearchAddon({
    plan: org?.plan ?? plan,
    webSearchAddonStatus: org?.webSearchAddonStatus,
  });
}

export function webSearchAddonRequiredBody() {
  return {
    error: `Web Search is a $${WEB_SEARCH_ADDON.amountUsd}/month add-on. Subscribe on Billing to unlock live Google results via Vertex AI Grounding.`,
    code: "addon_required" as const,
    addon: "web_search" as const,
    amountUsd: WEB_SEARCH_ADDON.amountUsd,
  };
}
