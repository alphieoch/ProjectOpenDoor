-- FIFO credit grants (4-month subscription / 30-day bonus / long-lived prepaid)
-- plus Claude-style 5h chat windows. Extends organizations/users; no workspaces table.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS currency varchar(8) NOT NULL DEFAULT 'USD';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_credit_sub_cap_cents integer,
  ADD COLUMN IF NOT EXISTS allowed_chat_modes text[] NOT NULL DEFAULT ARRAY['flash','auto','thinking','max','max_fast']::text[];

CREATE TABLE IF NOT EXISTS credit_ledger_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  initial_amount_cents INTEGER NOT NULL,
  remaining_amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  bucket_type TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_ledger_buckets_type_chk
    CHECK (bucket_type IN ('subscription_grant', 'top_up_prepaid', 'bonus')),
  CONSTRAINT credit_ledger_buckets_amounts_chk
    CHECK (initial_amount_cents >= 0 AND remaining_amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS credit_ledger_buckets_org_expires_idx
  ON credit_ledger_buckets (organization_id, expires_at);

CREATE INDEX IF NOT EXISTS credit_ledger_buckets_remaining_idx
  ON credit_ledger_buckets (organization_id, remaining_amount_cents)
  WHERE remaining_amount_cents > 0;

CREATE TABLE IF NOT EXISTS chat_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  window_start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_expires_at TIMESTAMPTZ NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT 'user',
  CONSTRAINT chat_rate_limits_scope_chk CHECK (scope IN ('user', 'workspace')),
  CONSTRAINT chat_rate_limits_count_chk CHECK (message_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_rate_limits_user_scope_uidx
  ON chat_rate_limits (organization_id, user_id, scope)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_rate_limits_workspace_scope_uidx
  ON chat_rate_limits (organization_id, scope)
  WHERE user_id IS NULL AND scope = 'workspace';

CREATE INDEX IF NOT EXISTS chat_rate_limits_org_expires_idx
  ON chat_rate_limits (organization_id, window_expires_at);

ALTER TABLE credit_ledger_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rate_limits ENABLE ROW LEVEL SECURITY;
