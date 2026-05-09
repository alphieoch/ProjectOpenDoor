-- Add password protection and MCP servers to ai_assistants
ALTER TABLE "ai_assistants"
  ADD COLUMN IF NOT EXISTS "password_protected" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "password_hash" text,
  ADD COLUMN IF NOT EXISTS "mcp_servers" jsonb DEFAULT '[]'::jsonb;
