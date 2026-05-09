CREATE TABLE IF NOT EXISTS assistant_connections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id         UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  app_slug             VARCHAR(100) NOT NULL,
  app_name             VARCHAR(255),
  app_logo             TEXT,
  connected_account_id VARCHAR(255),
  status               VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assistant_id, app_slug)
);
CREATE INDEX IF NOT EXISTS assistant_connections_assistant_idx ON assistant_connections (assistant_id);
