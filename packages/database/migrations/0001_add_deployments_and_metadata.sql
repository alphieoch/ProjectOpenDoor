-- Add metadata to requests table
ALTER TABLE requests ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create deployment_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deployment_status') THEN
    CREATE TYPE deployment_status AS ENUM ('pending', 'building', 'running', 'stopped', 'failed', 'deleting');
  END IF;
END$$;

-- Create deployments table
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_value TEXT NOT NULL,
  cpu NUMERIC(4,2) NOT NULL DEFAULT 0.5,
  memory_gb NUMERIC(4,1) NOT NULL DEFAULT 1.0,
  replicas INTEGER NOT NULL DEFAULT 1,
  container_app_name VARCHAR(100),
  fqdn TEXT,
  azure_resource_id TEXT,
  status deployment_status NOT NULL DEFAULT 'pending',
  status_message TEXT,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  compute_hours_billed NUMERIC(12,4) DEFAULT 0,
  compute_cost_usd NUMERIC(12,4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deployments_org_idx ON deployments(organization_id);
CREATE INDEX IF NOT EXISTS deployments_status_idx ON deployments(status);

-- Create model_catalog table
CREATE TABLE IF NOT EXISTS model_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  hf_repo VARCHAR(255),
  inference_engine VARCHAR(50) NOT NULL DEFAULT 'vllm',
  default_cpu NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  default_memory_gb NUMERIC(4,1) NOT NULL DEFAULT 2.0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
