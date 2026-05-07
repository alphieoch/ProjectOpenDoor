CREATE TABLE IF NOT EXISTS ai_assistants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES users(id),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) NOT NULL UNIQUE,
  description     TEXT,
  avatar_letter   VARCHAR(1),
  primary_color   VARCHAR(7) DEFAULT '#1A73E8',
  model_id        VARCHAR(100) DEFAULT 'gpt-4o',
  system_prompt   TEXT,
  welcome_message TEXT,
  max_messages    INTEGER,
  visibility      VARCHAR(20) DEFAULT 'private',
  monetization    VARCHAR(20) DEFAULT 'free',
  price_cents     INTEGER DEFAULT 0,
  stripe_price_id VARCHAR(255),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_assistants_org_idx  ON ai_assistants (organization_id);
CREATE INDEX IF NOT EXISTS ai_assistants_slug_idx ON ai_assistants (slug);
