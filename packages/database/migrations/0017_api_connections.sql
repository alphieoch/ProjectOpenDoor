-- Add API connections support for AI assistants

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS api_connections JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS assistant_api_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  secret_ciphertext TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  secret_tag TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS assistant_api_secrets_assistant_idx ON assistant_api_secrets(assistant_id);
