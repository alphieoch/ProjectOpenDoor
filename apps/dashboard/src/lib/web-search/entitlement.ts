import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq, sql } from "drizzle-orm";
import { WEB_SEARCH_ADDON, workspaceHasWebSearchAddon } from "@opendoor/shared";
import type { SessionPayload } from "@/lib/auth";
import { webSearchAddonPriceId } from "@/lib/stripe";

const g = global as typeof global & { _webSearchAddonColsReady?: boolean };

export async function ensureWebSearchAddonColumns() {
  if (g._webSearchAddonColsReady) return;
  const db = getDb();
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS web_search_addon_status varchar(50) NOT NULL DEFAULT 'inactive'`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_web_search_subscription_id varchar(255)`);
  g._webSearchAddonColsReady = true;
}

export async function loadWebSearchEntitlement(orgId: string, session?: SessionPayload) {
  await ensureWebSearchAddonColumns();
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      plan: true,
      webSearchAddonStatus: true,
      stripeWebSearchSubscriptionId: true,
    },
  });
  const active = Boolean(
    session?.isSiteAdmin ||
    workspaceHasWebSearchAddon({
      plan: org?.plan,
      webSearchAddonStatus: org?.webSearchAddonStatus,
    }),
  );
  return {
    active,
    status: org?.webSearchAddonStatus || "inactive",
    includedInPlan: org?.plan === "enterprise",
    amountUsd: WEB_SEARCH_ADDON.amountUsd,
    amountCents: WEB_SEARCH_ADDON.amountCents,
    configured: Boolean(webSearchAddonPriceId()),
    name: WEB_SEARCH_ADDON.name,
  };
}

export function webSearchAddonRequiredResponse(
  entitlement: Awaited<ReturnType<typeof loadWebSearchEntitlement>>,
) {
  return {
    error: `Web Search is a $${entitlement.amountUsd}/month add-on, or enable it on Tools for usage-based cost. Subscribe on Billing or open /dashboard/tools.`,
    code: "addon_required" as const,
    addon: "web_search" as const,
    amountUsd: entitlement.amountUsd,
    checkout: entitlement.configured,
  };
}
