CREATE TABLE IF NOT EXISTS workspace_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES workspace_agents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL,
  content text NOT NULL DEFAULT '',
  tool_name varchar(80),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_agent_messages_agent_idx ON workspace_agent_messages(agent_id);
CREATE INDEX IF NOT EXISTS workspace_agent_messages_org_idx ON workspace_agent_messages(organization_id);
