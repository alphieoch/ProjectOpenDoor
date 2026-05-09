-- Add period and weekly message limits to ai_assistants

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS period_window VARCHAR(20),
  ADD COLUMN IF NOT EXISTS period_message_limit INTEGER,
  ADD COLUMN IF NOT EXISTS weekly_message_limit INTEGER;

-- Add period/weekly usage tracking to assistant_purchases

ALTER TABLE assistant_purchases
  ADD COLUMN IF NOT EXISTS period_messages_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_window_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS weekly_messages_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS week_started_at TIMESTAMP WITH TIME ZONE;
