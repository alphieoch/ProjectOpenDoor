-- Org-scoped BYOK provider keys (AES-256-GCM ciphertext, never store plaintext)

CREATE TABLE IF NOT EXISTS organization_provider_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_slug VARCHAR(50) NOT NULL,
  label VARCHAR(255),
  key_ciphertext TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_tag TEXT NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  always_use BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_provider_keys_org_idx
  ON organization_provider_keys (organization_id);

CREATE INDEX IF NOT EXISTS organization_provider_keys_org_slug_idx
  ON organization_provider_keys (organization_id, provider_slug);

CREATE UNIQUE INDEX IF NOT EXISTS organization_provider_keys_org_slug_active_idx
  ON organization_provider_keys (organization_id, provider_slug)
  WHERE revoked_at IS NULL;
