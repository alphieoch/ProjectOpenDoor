import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

const g = global as typeof global & { _workflowSchemaReady?: boolean };

export async function ensureWorkflowSchema() {
  if (g._workflowSchemaReady) return;
  const db = getDb();

  await db.execute(sql`
    ALTER TABLE workflows
      ADD COLUMN IF NOT EXISTS trigger jsonb NOT NULL DEFAULT '{"type":"manual"}'::jsonb,
      ADD COLUMN IF NOT EXISTS variables jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS published_graph jsonb,
      ADD COLUMN IF NOT EXISTS published_version integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS published_at timestamptz,
      ADD COLUMN IF NOT EXISTS webhook_secret varchar(64),
      ADD COLUMN IF NOT EXISTS next_run_at timestamptz
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS workflows_next_run_idx ON workflows (next_run_at)`);
  await db.execute(sql`
    ALTER TABLE workflow_runs
      ADD COLUMN IF NOT EXISTS trigger_type varchar(50) NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS version integer,
      ADD COLUMN IF NOT EXISTS assigned_to varchar(255),
      ADD COLUMN IF NOT EXISTS due_at timestamptz,
      ADD COLUMN IF NOT EXISTS resume_at timestamptz,
      ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS workflow_runs_status_idx
    ON workflow_runs (status, resume_at)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS workflow_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      version integer NOT NULL,
      graph jsonb NOT NULL,
      trigger jsonb NOT NULL DEFAULT '{"type":"manual"}'::jsonb,
      variables jsonb NOT NULL DEFAULT '{}'::jsonb,
      note text,
      published_by uuid REFERENCES users(id),
      published_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS workflow_versions_workflow_idx
    ON workflow_versions (workflow_id, version)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS workflow_versions_org_idx
    ON workflow_versions (organization_id)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS workflow_versions_unique
    ON workflow_versions (workflow_id, version)
  `);

  g._workflowSchemaReady = true;
}
