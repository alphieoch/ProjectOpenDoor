import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

const g = global as typeof global & { _agentSchemaReady?: boolean };

export async function ensureAgentSchema() {
  if (g._agentSchemaReady) return;
  const db = getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS workspace_agents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      created_by uuid REFERENCES users(id),
      name varchar(200) NOT NULL,
      slug varchar(100) NOT NULL,
      runtime varchar(40) NOT NULL,
      model_id varchar(150) NOT NULL,
      system_prompt text,
      status varchar(30) NOT NULL DEFAULT 'pending',
      status_message text,
      api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
      key_prefix varchar(16),
      secret_ciphertext text,
      secret_iv text,
      secret_tag text,
      config jsonb DEFAULT '{}'::jsonb,
      last_used_at timestamptz,
      started_at timestamptz,
      stopped_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, slug)
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS workspace_agents_org_idx ON workspace_agents(organization_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS workspace_agents_status_idx ON workspace_agents(status)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS workspace_agent_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id uuid NOT NULL REFERENCES workspace_agents(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      role varchar(20) NOT NULL,
      content text NOT NULL DEFAULT '',
      tool_name varchar(80),
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS workspace_agent_messages_agent_idx ON workspace_agent_messages(agent_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS workspace_agent_messages_org_idx ON workspace_agent_messages(organization_id)`);
  g._agentSchemaReady = true;
}
