-- Credits ledger + model family classification for prepaid billing

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS credits_usd_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_credit_granted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_recharge_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_recharge_threshold_cents BIGINT,
  ADD COLUMN IF NOT EXISTS auto_recharge_amount_cents BIGINT,
  ADD COLUMN IF NOT EXISTS default_payment_method_id VARCHAR(255);

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS family VARCHAR(20) NOT NULL DEFAULT 'closed';

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL,
  amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  request_id UUID,
  stripe_payment_intent_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_transactions_org_created_idx
  ON credit_transactions(organization_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_payment_intent_idx
  ON credit_transactions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Open-weight model families (default remains closed)
UPDATE models
SET family = 'open_weight'
WHERE family <> 'open_weight'
  AND (
    model_id ILIKE 'deepseek%'
    OR model_id ILIKE 'qwen%'
    OR model_id ILIKE 'mistral%'
    OR model_id LIKE 'custom:%'
  );
