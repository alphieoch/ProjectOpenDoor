-- Add per-key spend cap columns to api_keys table
ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "spend_limit_usd_cents" bigint,
  ADD COLUMN IF NOT EXISTS "spend_used_usd_cents" bigint NOT NULL DEFAULT 0;

-- Index for fast spend limit lookups
CREATE INDEX IF NOT EXISTS "api_keys_spend_limit_idx" ON "api_keys" ("spend_limit_usd_cents");
