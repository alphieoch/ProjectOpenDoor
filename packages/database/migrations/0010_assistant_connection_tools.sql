CREATE TABLE IF NOT EXISTS assistant_connection_tools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES assistant_connections(id) ON DELETE CASCADE,
  tool_slug     VARCHAR(255) NOT NULL,
  tool_name     VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id, tool_slug)
);
CREATE INDEX IF NOT EXISTS assistant_connection_tools_conn_idx ON assistant_connection_tools (connection_id);
