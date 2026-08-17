CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'running',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  step_outputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS workflow_runs_workflow_idx
  ON workflow_runs (workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_runs_org_idx
  ON workflow_runs (organization_id);
