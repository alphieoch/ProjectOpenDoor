-- Add message usage tracking to assistant purchases

ALTER TABLE assistant_purchases
  ADD COLUMN messages_used INTEGER DEFAULT 0;

-- Add usage_mode to ai_assistants if not already present (from earlier partial migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_assistants' AND column_name = 'usage_mode'
  ) THEN
    ALTER TABLE ai_assistants ADD COLUMN usage_mode VARCHAR(20) DEFAULT 'included';
  END IF;
END $$;
