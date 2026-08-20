-- First-party Tools entitlements (workflow / gateway catalog). Usage is billed per call.
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
);

CREATE INDEX IF NOT EXISTS organization_tools_org_idx
  ON organization_tools (organization_id);
