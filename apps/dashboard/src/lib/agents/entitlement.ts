import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq, sql } from "drizzle-orm";
import { AGENTS_ADDON, workspaceHasAgentsAddon } from "@opendoor/shared";
import type { SessionPayload } from "@/lib/auth";
import { agentsAddonPriceId } from "@/lib/stripe";

const g = global as typeof global & { _agentsAddonColsReady?: boolean };

export async function ensureAgentsAddonColumns() {
  if (g._agentsAddonColsReady) return;
  const db = getDb();
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS agents_addon_status varchar(50) NOT NULL DEFAULT 'inactive'`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_agents_subscription_id varchar(255)`);
  g._agentsAddonColsReady = true;
}

export async function loadAgentsEntitlement(orgId: string, session?: SessionPayload) {
  await ensureAgentsAddonColumns();
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      plan: true,
      agentsAddonStatus: true,
      stripeAgentsSubscriptionId: true,
    },
  });
  const active = Boolean(
    session?.isSiteAdmin ||
    workspaceHasAgentsAddon({
      plan: org?.plan,
      agentsAddonStatus: org?.agentsAddonStatus,
    }),
  );
  return {
    active,
    status: org?.agentsAddonStatus || "inactive",
    includedInPlan: org?.plan === "enterprise",
    amountUsd: AGENTS_ADDON.amountUsd,
    amountCents: AGENTS_ADDON.amountCents,
    configured: Boolean(agentsAddonPriceId()),
    name: AGENTS_ADDON.name,
  };
}

export function agentsAddonRequiredResponse(entitlement: Awaited<ReturnType<typeof loadAgentsEntitlement>>) {
  return {
    error: `Agents is a $${entitlement.amountUsd}/month add-on. Subscribe on Billing or this page to unlock OpenClaw, Hermes, NemoClaw, and OpenBot.`,
    addon: "agents",
    amountUsd: entitlement.amountUsd,
    checkout: entitlement.configured,
  };
}
