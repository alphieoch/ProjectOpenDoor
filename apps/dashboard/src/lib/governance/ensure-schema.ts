import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

const g = global as typeof global & { _govSchemaReady?: boolean };

async function run(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.warn(`[governance-schema] ${label}:`, err instanceof Error ? err.message : err);
  }
}

async function schemaAlreadyReady() {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT
        to_regclass('public.compliance_rules') IS NOT NULL AS rules_ok,
        to_regclass('public.compliance_reports') IS NOT NULL AS reports_ok,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'model_governance'
            AND column_name = 'owner_team'
        ) AS cols_ok
    `);
    const row = Array.isArray(rows) ? rows[0] : (rows as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    if (!row) return false;
    return Boolean(row.rules_ok && row.reports_ok && row.cols_ok);
  } catch {
    return false;
  }
}

export async function ensureGovernanceSchema() {
  if (g._govSchemaReady) return;
  if (await schemaAlreadyReady()) {
    g._govSchemaReady = true;
    return;
  }

  const db = getDb();

  await run("sector insurance", () => db.execute(sql`ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'insurance'`));
  await run("sector education", () => db.execute(sql`ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'education'`));
  await run("sector energy", () => db.execute(sql`ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'energy'`));
  await run("sector retail", () => db.execute(sql`ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'retail'`));
  await run("sector media", () => db.execute(sql`ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'media'`));
  await run("sector transport", () => db.execute(sql`ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'transport'`));

  await run("owner_team", () => db.execute(sql`ALTER TABLE model_governance ADD COLUMN IF NOT EXISTS owner_team varchar(255)`));
  await run("business_criticality", () => db.execute(sql`ALTER TABLE model_governance ADD COLUMN IF NOT EXISTS business_criticality varchar(50) DEFAULT 'standard'`));
  await run("allowed_regions", () => db.execute(sql`ALTER TABLE model_governance ADD COLUMN IF NOT EXISTS allowed_regions jsonb DEFAULT '["uk","eu"]'::jsonb`));
  await run("last_reviewed_by", () => db.execute(sql`ALTER TABLE model_governance ADD COLUMN IF NOT EXISTS last_reviewed_by uuid`));
  await run("last_reviewed_at", () => db.execute(sql`ALTER TABLE model_governance ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz`));
  await run("scope", () => db.execute(sql`ALTER TABLE model_policies ADD COLUMN IF NOT EXISTS scope varchar(50) DEFAULT 'organization' NOT NULL`));

  await run("compliance_rules", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid REFERENCES organizations(id),
      name varchar(255) NOT NULL,
      description text,
      framework compliance_framework,
      control_code varchar(50),
      rule_type varchar(50) NOT NULL DEFAULT 'model_attribute',
      rule_config jsonb,
      severity varchar(50) NOT NULL DEFAULT 'medium',
      recommendation text,
      reference_url text,
      reference_name text,
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `));

  await run("compliance_reports", () => db.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid REFERENCES organizations(id),
      model_governance_id uuid REFERENCES model_governance(id),
      title varchar(255) NOT NULL,
      description text,
      framework compliance_framework,
      status_summary jsonb,
      findings jsonb,
      recommendations jsonb,
      score integer,
      passed boolean DEFAULT false,
      generated_at timestamptz NOT NULL DEFAULT now(),
      generated_by uuid REFERENCES users(id)
    )
  `));

  g._govSchemaReady = true;
}
