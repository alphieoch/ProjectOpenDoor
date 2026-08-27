-- Soft-delete workspace agents for a 7-day recovery window.
ALTER TABLE workspace_agents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS workspace_agents_deleted_at_idx
  ON workspace_agents (deleted_at)
  WHERE deleted_at IS NOT NULL;
