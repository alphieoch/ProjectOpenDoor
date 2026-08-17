-- Welcome credit is a restricted, expiring bucket inside the org balance.
-- It can buy open-weight serverless tokens only — not closed APIs or GCP GPUs.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS welcome_credits_usd_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welcome_expires_at timestamptz;

UPDATE organizations
SET
  welcome_credits_usd_cents = LEAST(credits_usd_cents, 500),
  welcome_expires_at = NOW() + INTERVAL '30 days'
WHERE signup_credit_granted = true
  AND plan = 'free'
  AND credits_usd_cents > 0
  AND welcome_credits_usd_cents = 0;
