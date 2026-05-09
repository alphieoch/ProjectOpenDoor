-- Add cooldown period support for AI assistants

ALTER TABLE ai_assistants
  ADD COLUMN cooldown_minutes INTEGER;

ALTER TABLE assistant_purchases
  ADD COLUMN last_message_at TIMESTAMP WITH TIME ZONE;
