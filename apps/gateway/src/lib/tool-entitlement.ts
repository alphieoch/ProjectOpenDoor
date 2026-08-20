import { and, eq, sql } from "drizzle-orm";
import { db, organizationTools } from "@opendoor/database";

const g = global as typeof global & { _organizationToolsReady?: boolean };

export async function ensureOrganizationToolsTable() {
  if (g._organizationToolsReady) return;
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
  g._organizationToolsReady = true;
}

export async function orgHasToolEnabled(orgId: string, toolId: string): Promise<boolean> {
  await ensureOrganizationToolsTable();
  const row = await db.query.organizationTools.findFirst({
    where: and(
      eq(organizationTools.organizationId, orgId),
      eq(organizationTools.toolId, toolId)
    ),
  });
  return row?.status === "enabled";
}
