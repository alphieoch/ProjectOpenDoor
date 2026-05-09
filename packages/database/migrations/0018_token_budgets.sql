-- Token budgets, metered billing, and cost caps for AI assistants

-- Organization-level token budgets
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS daily_token_budget BIGINT,
  ADD COLUMN IF NOT EXISTS weekly_token_budget BIGINT,
  ADD COLUMN IF NOT EXISTS monthly_token_budget BIGINT,
  ADD COLUMN IF NOT EXISTS budget_alert_threshold_percent INTEGER DEFAULT 80;

-- Assistant token limits and metered pricing
ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS max_tokens_per_session INTEGER,
  ADD COLUMN IF NOT EXISTS max_tokens_per_period INTEGER,
  ADD COLUMN IF NOT EXISTS max_tokens_per_message INTEGER,
  ADD COLUMN IF NOT EXISTS cost_cap_cents INTEGER,
  ADD COLUMN IF NOT EXISTS metered_price_per_message_cents INTEGER,
  ADD COLUMN IF NOT EXISTS metered_price_per_1k_tokens_cents INTEGER;

-- Purchase-level token/cost tracking
ALTER TABLE assistant_purchases
  ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_used_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_tokens_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_tokens_used INTEGER DEFAULT 0;

-- Org budget usage tracking
CREATE TABLE IF NOT EXISTS org_budget_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  window_type VARCHAR(20) NOT NULL, -- "daily", "weekly", "monthly"
  window_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  cost_cents_used BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS org_budget_usage_org_window_idx ON org_budget_usage(organization_id, window_type, window_started_at);
