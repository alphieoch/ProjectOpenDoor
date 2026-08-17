-- Wave 1: rerank / completion request types + async batch jobs

DO $$ BEGIN
  ALTER TYPE request_type ADD VALUE 'rerank';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE request_type ADD VALUE 'completion';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  api_key_id UUID NOT NULL REFERENCES api_keys(id),
  endpoint VARCHAR(100) NOT NULL DEFAULT '/v1/chat/completions',
  model_id VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '[]',
  output JSONB,
  error TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS batch_jobs_org_idx ON batch_jobs (organization_id);
CREATE INDEX IF NOT EXISTS batch_jobs_status_idx ON batch_jobs (status);
CREATE INDEX IF NOT EXISTS batch_jobs_org_created_idx ON batch_jobs (organization_id, created_at DESC);
