-- Full OpenDoor schema
-- Created manually for initial setup

-- Enums
DO $$ BEGIN
  CREATE TYPE request_status AS ENUM ('success', 'error', 'cached');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE request_type AS ENUM ('chat', 'embedding', 'image');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deployment_status AS ENUM ('pending', 'building', 'running', 'stopped', 'failed', 'deleting');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  monthly_budget_usd NUMERIC(10, 2) DEFAULT '0',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  stripe_price_id VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'inactive',
  workos_organization_id VARCHAR(255),
  workos_connection_id VARCHAR(255),
  sso_enabled BOOLEAN DEFAULT false,
  sso_default_role VARCHAR(50) DEFAULT 'member',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  password_hash TEXT,
  organization_id UUID REFERENCES organizations(id),
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  allowed_models JSONB,
  rate_limit_rpm INTEGER DEFAULT 60,
  rate_limit_tpm INTEGER DEFAULT 100000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys(key_prefix);

-- Providers
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  base_url TEXT,
  api_key_env_var VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  region VARCHAR(50),
  is_western BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Models
CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  model_id VARCHAR(100) NOT NULL,
  display_name VARCHAR(255),
  owned_by VARCHAR(100),
  context_window INTEGER,
  supports_vision BOOLEAN DEFAULT false,
  supports_tools BOOLEAN DEFAULT false,
  supports_json_mode BOOLEAN DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS models_provider_model_idx ON models(provider_id, model_id);

-- Pricing Rules
CREATE TABLE IF NOT EXISTS pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  model_id VARCHAR(100) NOT NULL,
  region VARCHAR(50) NOT NULL DEFAULT 'global',
  input_cost_per_1k NUMERIC(12, 8) NOT NULL,
  output_cost_per_1k NUMERIC(12, 8) NOT NULL,
  markup_percent NUMERIC(5, 2) NOT NULL,
  final_input_cost_per_1k NUMERIC(12, 8) NOT NULL,
  final_output_cost_per_1k NUMERIC(12, 8) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pricing_provider_model_region_idx ON pricing_rules(provider_id, model_id, region);

-- Requests
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  provider_id UUID NOT NULL REFERENCES providers(id),
  model_id VARCHAR(100) NOT NULL,
  request_type request_type NOT NULL DEFAULT 'chat',
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 8) NOT NULL DEFAULT '0',
  status request_status NOT NULL DEFAULT 'success',
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  region VARCHAR(50) NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS requests_org_idx ON requests(organization_id);
CREATE INDEX IF NOT EXISTS requests_created_at_idx ON requests(created_at);
CREATE INDEX IF NOT EXISTS requests_provider_model_idx ON requests(provider_id, model_id);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  metadata JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_org_idx ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);

-- Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  token VARCHAR(255) NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invitations_org_idx ON invitations(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_idx ON invitations(token);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations(email);

-- Usage Daily
CREATE TABLE IF NOT EXISTS usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  date TIMESTAMPTZ NOT NULL,
  provider_id UUID NOT NULL REFERENCES providers(id),
  model_id VARCHAR(100) NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 8) NOT NULL DEFAULT '0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_daily_org_date_idx ON usage_daily(organization_id, date, provider_id, model_id);

-- Deployments
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

-- Model Catalog
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

-- Seed providers
INSERT INTO providers (name, slug, api_key_env_var, enabled, is_western) VALUES
  ('OpenAI', 'openai', 'OPENAI_API_KEY', true, true),
  ('Anthropic', 'anthropic', 'ANTHROPIC_API_KEY', true, true),
  ('Google', 'google', 'GOOGLE_API_KEY', true, true),
  ('Cohere', 'cohere', 'COHERE_API_KEY', true, true),
  ('Mistral', 'mistral', 'MISTRAL_API_KEY', true, true),
  ('DeepSeek', 'deepseek', 'DEEPSEEK_API_KEY', true, false),
  ('Qwen', 'qwen', 'QWEN_API_KEY', true, false),
  ('Azure Foundry', 'azure-foundry', 'AZURE_FOUNDRY_API_KEY', true, true)
ON CONFLICT (slug) DO NOTHING;

-- Seed pricing rules (sample - adjust as needed)
INSERT INTO pricing_rules (provider_id, model_id, region, input_cost_per_1k, output_cost_per_1k, markup_percent, final_input_cost_per_1k, final_output_cost_per_1k)
SELECT p.id, 'gpt-4o', 'global', 0.00500, 0.01500, 20.00, 0.00600, 0.01800
FROM providers p WHERE p.slug = 'openai'
ON CONFLICT DO NOTHING;

INSERT INTO pricing_rules (provider_id, model_id, region, input_cost_per_1k, output_cost_per_1k, markup_percent, final_input_cost_per_1k, final_output_cost_per_1k)
SELECT p.id, 'gpt-4o-mini', 'global', 0.00015, 0.00060, 20.00, 0.00018, 0.00072
FROM providers p WHERE p.slug = 'openai'
ON CONFLICT DO NOTHING;

INSERT INTO pricing_rules (provider_id, model_id, region, input_cost_per_1k, output_cost_per_1k, markup_percent, final_input_cost_per_1k, final_output_cost_per_1k)
SELECT p.id, 'claude-3-5-sonnet-20241022', 'global', 0.00300, 0.01500, 20.00, 0.00360, 0.01800
FROM providers p WHERE p.slug = 'anthropic'
ON CONFLICT DO NOTHING;

INSERT INTO pricing_rules (provider_id, model_id, region, input_cost_per_1k, output_cost_per_1k, markup_percent, final_input_cost_per_1k, final_output_cost_per_1k)
SELECT p.id, 'gemini-1.5-pro', 'global', 0.00350, 0.01050, 20.00, 0.00420, 0.01260
FROM providers p WHERE p.slug = 'google'
ON CONFLICT DO NOTHING;

INSERT INTO pricing_rules (provider_id, model_id, region, input_cost_per_1k, output_cost_per_1k, markup_percent, final_input_cost_per_1k, final_output_cost_per_1k)
SELECT p.id, 'mistral-large-latest', 'global', 0.00200, 0.00600, 20.00, 0.00240, 0.00720
FROM providers p WHERE p.slug = 'mistral'
ON CONFLICT DO NOTHING;

INSERT INTO pricing_rules (provider_id, model_id, region, input_cost_per_1k, output_cost_per_1k, markup_percent, final_input_cost_per_1k, final_output_cost_per_1k)
SELECT p.id, 'deepseek-chat', 'global', 0.00027, 0.00110, 50.00, 0.00041, 0.00165
FROM providers p WHERE p.slug = 'deepseek'
ON CONFLICT DO NOTHING;

INSERT INTO pricing_rules (provider_id, model_id, region, input_cost_per_1k, output_cost_per_1k, markup_percent, final_input_cost_per_1k, final_output_cost_per_1k)
SELECT p.id, 'qwen-max', 'global', 0.00072, 0.00288, 50.00, 0.00108, 0.00432
FROM providers p WHERE p.slug = 'qwen'
ON CONFLICT DO NOTHING;

-- Seed model catalog
INSERT INTO model_catalog (model_id, display_name, description, hf_repo, inference_engine, default_cpu, default_memory_gb) VALUES
  ('llama-3.1-8b-instruct', 'Llama 3.1 8B Instruct', 'Meta''s Llama 3.1 8B parameter instruction-tuned model.', 'meta-llama/Meta-Llama-3.1-8B-Instruct', 'vllm', '1.0', '2.0'),
  ('mistral-7b-instruct', 'Mistral 7B Instruct', 'Mistral AI''s 7B instruction-tuned model.', 'mistralai/Mistral-7B-Instruct-v0.3', 'vllm', '1.0', '2.0'),
  ('qwen2.5-7b-instruct', 'Qwen 2.5 7B Instruct', 'Alibaba Qwen 2.5 7B instruction-tuned model.', 'Qwen/Qwen2.5-7B-Instruct', 'vllm', '1.0', '2.0'),
  ('gemma-2-9b-it', 'Gemma 2 9B IT', 'Google''s Gemma 2 9B instruction-tuned model.', 'google/gemma-2-9b-it', 'vllm', '1.0', '2.5')
ON CONFLICT (model_id) DO NOTHING;
