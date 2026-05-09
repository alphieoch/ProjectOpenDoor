-- Add logo URL to AI assistants
ALTER TABLE ai_assistants ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);

-- Knowledge base documents for AI assistants
CREATE TABLE IF NOT EXISTS assistant_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id    UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  file_type       VARCHAR(50),
  file_size_bytes INTEGER,
  blob_url        TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'uploaded',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS assistant_documents_assistant_idx ON assistant_documents (assistant_id);
