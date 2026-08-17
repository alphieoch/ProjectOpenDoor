-- OpenDoor Chat (first-party house model) + parental protection

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS protected_child BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS house_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS house_chats_user_updated_idx
  ON house_chats (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS house_chats_org_idx
  ON house_chats (organization_id);

CREATE TABLE IF NOT EXISTS house_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES house_chats(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  mode VARCHAR(20),
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS house_chat_messages_chat_idx
  ON house_chat_messages (chat_id, created_at);

CREATE TABLE IF NOT EXISTS house_chat_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_messages_used INTEGER NOT NULL DEFAULT 0,
  period_window_started_at TIMESTAMPTZ,
  weekly_messages_used INTEGER NOT NULL DEFAULT 0,
  week_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS house_chat_usage_user_uidx
  ON house_chat_usage (user_id);
