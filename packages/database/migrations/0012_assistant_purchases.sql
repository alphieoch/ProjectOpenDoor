-- Assistant purchase/subscription tracking for monetized AI assistants

CREATE TABLE assistant_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('one_time', 'subscription')),
  stripe_customer_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  amount_cents INTEGER NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX assistant_purchases_assistant_idx ON assistant_purchases(assistant_id);
CREATE INDEX assistant_purchases_user_idx ON assistant_purchases(user_id);
CREATE INDEX assistant_purchases_subscription_idx ON assistant_purchases(stripe_subscription_id);
CREATE UNIQUE INDEX assistant_purchases_unique ON assistant_purchases(assistant_id, user_id, type);
