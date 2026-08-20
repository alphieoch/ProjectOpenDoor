import { and, eq, sql } from "drizzle-orm";
import { organizationTools, organizations } from "@opendoor/database";
import {
  ENTERPRISE_INCLUDED_TOOL_IDS,
  PLATFORM_TOOLS,
  decideToolCharge,
  decideToolDisable,
  decideToolEnable,
  getPlatformTool,
  usesWebSearchAddon,
  workspaceHasEnterpriseTools,
  type ToolEntitlementStatus,
} from "@opendoor/shared";
import { getDb } from "@/lib/db";
import {
  assertOrgCanSpend,
  debitOrgUsage,
  spendableFromWaterfall,
} from "@/lib/credits";
import { publicToolRow } from "@/lib/tools/catalog";

export { publicToolRow } from "@/lib/tools/catalog";

const g = global as typeof global & { _organizationToolsReady?: boolean };

export async function ensureOrganizationToolsTable() {
  if (g._organizationToolsReady) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS organization_tools (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      tool_id varchar(80) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'enabled',
      enabled_by uuid REFERENCES users(id),
      enabled_at timestamptz NOT NULL DEFAULT now(),
      disabled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, tool_id)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS organization_tools_org_idx
    ON organization_tools (organization_id)
  `);
  g._organizationToolsReady = true;
}

export async function listOrgToolRows(orgId: string) {
  await ensureOrganizationToolsTable();
  const db = getDb();
  return db.query.organizationTools.findMany({
    where: eq(organizationTools.organizationId, orgId),
  });
}

export async function getOrgToolRow(orgId: string, toolId: string) {
  await ensureOrganizationToolsTable();
  const db = getDb();
  return db.query.organizationTools.findFirst({
    where: and(
      eq(organizationTools.organizationId, orgId),
      eq(organizationTools.toolId, toolId)
    ),
  });
}

export async function orgHasToolEnabled(orgId: string, toolId: string): Promise<boolean> {
  const canonical = getPlatformTool(toolId)?.id || toolId;
  const row = await getOrgToolRow(orgId, canonical);
  return row?.status === "enabled";
}

export async function loadOrgPlan(orgId: string): Promise<string | null> {
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { plan: true },
  });
  return org?.plan ?? null;
}

export async function ensureEnterpriseToolBundle(input: {
  orgId: string;
  userId: string;
}) {
  await ensureOrganizationToolsTable();
  const db = getDb();
  const now = new Date();
  const actor = /^[0-9a-f-]{36}$/i.test(input.userId) ? input.userId : null;
  for (const toolId of ENTERPRISE_INCLUDED_TOOL_IDS) {
    const existing = await getOrgToolRow(input.orgId, toolId);
    if (existing?.status === "enabled") continue;
    if (existing) {
      await db
        .update(organizationTools)
        .set({
          status: "enabled",
          enabledBy: actor,
          enabledAt: now,
          disabledAt: null,
          updatedAt: now,
        })
        .where(eq(organizationTools.id, existing.id));
      continue;
    }
    await db.insert(organizationTools).values({
      organizationId: input.orgId,
      toolId,
      status: "enabled",
      enabledBy: actor,
      enabledAt: now,
    });
  }
}

export async function listCatalogForOrg(
  orgId: string,
  opts?: { addonActive?: boolean; includedInPlan?: boolean; isSiteAdmin?: boolean }
) {
  const includedInPlan =
    opts?.includedInPlan ??
    workspaceHasEnterpriseTools({
      plan: await loadOrgPlan(orgId),
      isSiteAdmin: opts?.isSiteAdmin,
    });
  const rows = await listOrgToolRows(orgId);
  const byId = new Map(rows.map((row) => [row.toolId, row]));
  return PLATFORM_TOOLS.map((tool) => {
    const row = byId.get(tool.id);
    return publicToolRow(
      tool,
      row
        ? { status: row.status as ToolEntitlementStatus, enabledAt: row.enabledAt }
        : null,
      { addonActive: opts?.addonActive, includedInPlan }
    );
  });
}

export async function enableOrgTool(input: {
  orgId: string;
  toolId: string;
  userId: string;
  isSiteAdmin?: boolean;
  coveredByAddon?: boolean;
  includedInPlan?: boolean;
}) {
  const tool = getPlatformTool(input.toolId);
  const toolId = tool?.id || input.toolId;
  const existing = await getOrgToolRow(input.orgId, toolId);
  const afford = await assertOrgCanSpend(input.orgId, tool?.family || "closed", {
    isSiteAdmin: input.isSiteAdmin,
    userId: input.userId,
  });
  const spendable = afford.ok ? spendableFromWaterfall(afford.waterfall, tool?.family) : 0;
  const included =
    Boolean(input.includedInPlan) ||
    workspaceHasEnterpriseTools({
      plan: await loadOrgPlan(input.orgId),
      isSiteAdmin: input.isSiteAdmin,
    });
  const coveredByAddon =
    Boolean(input.coveredByAddon) || (usesWebSearchAddon(tool) && included);
  const catalogOpts = { includedInPlan: included, addonActive: coveredByAddon };
  const decision = decideToolEnable({
    tool,
    currentStatus: existing ? (existing.status as ToolEntitlementStatus) : null,
    unlimited: afford.ok && afford.unlimited,
    coveredByAddon,
    spendableCents: spendable,
  });
  if (!decision.ok) {
    return { error: decision.error, status: decision.status as 404 | 402 };
  }

  const db = getDb();
  const now = new Date();
  const actor = /^[0-9a-f-]{36}$/i.test(input.userId) ? input.userId : null;
  if (existing) {
    if (decision.alreadyEnabled) {
      return {
        entitlement: publicToolRow(
          tool!,
          { status: "enabled", enabledAt: existing.enabledAt },
          catalogOpts
        ),
        alreadyEnabled: true,
      };
    }
    const [row] = await db
      .update(organizationTools)
      .set({
        status: "enabled",
        enabledBy: actor,
        enabledAt: now,
        disabledAt: null,
        updatedAt: now,
      })
      .where(eq(organizationTools.id, existing.id))
      .returning();
    return {
      entitlement: publicToolRow(
        tool!,
        { status: "enabled", enabledAt: row.enabledAt },
        catalogOpts
      ),
      alreadyEnabled: false,
    };
  }

  const [row] = await db
    .insert(organizationTools)
    .values({
      organizationId: input.orgId,
      toolId,
      status: "enabled",
      enabledBy: actor,
      enabledAt: now,
    })
    .returning();
  return {
    entitlement: publicToolRow(
      tool!,
      { status: "enabled", enabledAt: row.enabledAt },
      catalogOpts
    ),
    alreadyEnabled: false,
  };
}

export async function disableOrgTool(orgId: string, toolId: string) {
  const tool = getPlatformTool(toolId);
  if (!tool) return { error: "Tool not found", status: 404 as const };
  const existing = await getOrgToolRow(orgId, tool.id);
  const decision = decideToolDisable({
    currentStatus: existing ? (existing.status as ToolEntitlementStatus) : null,
  });
  if (!decision.ok) return { error: decision.error, status: decision.status };
  if (!existing || decision.alreadyDisabled) {
    return { entitlement: publicToolRow(tool, existing ? { status: "disabled" } : null) };
  }
  const db = getDb();
  await db
    .update(organizationTools)
    .set({
      status: "disabled",
      disabledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizationTools.id, existing.id));
  return { entitlement: publicToolRow(tool, { status: "disabled" }) };
}

export async function chargeToolUsage(input: {
  orgId: string;
  toolId: string;
  userId?: string | null;
  units?: number;
  isSiteAdmin?: boolean;
  coveredByAddon?: boolean;
  dryRun?: boolean;
}) {
  const tool = getPlatformTool(input.toolId);
  if (!tool) return { error: "Tool not found", status: 404 as const };
  const afford = await assertOrgCanSpend(input.orgId, tool.family, {
    isSiteAdmin: input.isSiteAdmin,
    userId: input.userId,
  });
  const spendable = afford.ok ? spendableFromWaterfall(afford.waterfall, tool.family) : 0;
  const coveredByAddon =
    Boolean(input.coveredByAddon) ||
    (usesWebSearchAddon(tool) &&
      workspaceHasEnterpriseTools({
        plan: await loadOrgPlan(input.orgId),
        isSiteAdmin: input.isSiteAdmin,
      }));
  const decision = decideToolCharge({
    tool,
    unlimited: Boolean(afford.ok && afford.unlimited),
    coveredByAddon,
    spendableCents: spendable,
    units: input.units,
  });
  if (!decision.ok) return { error: decision.error, status: 402 as const };
  if (decision.chargeCents <= 0) {
    return { chargedCents: 0, unlimited: Boolean(afford.ok && afford.unlimited) };
  }
  if (input.dryRun) return { chargedCents: 0, unlimited: false };
  await debitOrgUsage(input.orgId, decision.chargeCents, undefined, {
    allowWelcome: tool.family === "open_weight",
    source: `tool:${tool.id}`,
    userId: input.userId,
  });
  return { chargedCents: decision.chargeCents, unlimited: false };
}
