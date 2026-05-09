-- Add seller earnings and platform fee tracking to monetized assistants

ALTER TABLE ai_assistants
  ADD COLUMN seller_earnings_cents INTEGER DEFAULT 0,
  ADD COLUMN platform_fee_percent INTEGER DEFAULT 1500; -- basis points (1500 = 15%)

ALTER TABLE assistant_purchases
  ADD COLUMN seller_earnings_cents INTEGER DEFAULT 0;
