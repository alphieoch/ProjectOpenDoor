-- Feature toggles for AI assistants
ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS deep_thinking_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS web_search_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_agent_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS code_execution_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_generation_enabled BOOLEAN NOT NULL DEFAULT false;
