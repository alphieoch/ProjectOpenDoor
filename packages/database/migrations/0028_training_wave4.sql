-- Wave 4: Fine-tuning / datasets / evals (Fireworks-parity training surface)
CREATE TABLE IF NOT EXISTS training_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  slug varchar(100) NOT NULL,
  format varchar(40) NOT NULL DEFAULT 'jsonl', -- jsonl | parquet
  purpose varchar(40) NOT NULL DEFAULT 'sft', -- sft | dpo | orpo | eval
  storage_uri text, -- gs:// or https:// or inline path
  row_count integer NOT NULL DEFAULT 0,
  byte_size bigint NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL DEFAULT 'ready', -- uploading | ready | failed
  sample jsonb, -- first few rows for UI
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS training_datasets_org_idx ON training_datasets(organization_id);

CREATE TABLE IF NOT EXISTS training_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES training_datasets(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  method varchar(40) NOT NULL DEFAULT 'sft', -- sft | dpo | orpo | rft | grpo
  base_model_id varchar(150) NOT NULL,
  output_model_id varchar(150), -- ft:<id> when ready
  hyperparameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- e.g. { "lora": true, "epochs": 3, "learning_rate": 1e-4, "batch_size": 4 }
  status varchar(30) NOT NULL DEFAULT 'queued',
  -- queued | validating | running | succeeded | failed | cancelled
  progress_percent integer NOT NULL DEFAULT 0,
  status_message text,
  provider_job_id varchar(255), -- Together / custom trainer id
  provider_slug varchar(50) DEFAULT 'together',
  cost_usd numeric(12, 4) DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_jobs_org_idx ON training_jobs(organization_id);
CREATE INDEX IF NOT EXISTS training_jobs_status_idx ON training_jobs(status);

CREATE TABLE IF NOT EXISTS fine_tuned_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  training_job_id uuid REFERENCES training_jobs(id) ON DELETE SET NULL,
  model_id varchar(150) NOT NULL, -- ft:<uuid> or together id
  display_name varchar(200) NOT NULL,
  base_model_id varchar(150) NOT NULL,
  provider_slug varchar(50) NOT NULL DEFAULT 'together',
  status varchar(30) NOT NULL DEFAULT 'active', -- active | archived
  -- Bill inference at base model list price (Fireworks-style)
  bill_as_base boolean NOT NULL DEFAULT true,
  adapter_uri text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, model_id)
);

CREATE INDEX IF NOT EXISTS fine_tuned_models_org_idx ON fine_tuned_models(organization_id);
CREATE INDEX IF NOT EXISTS fine_tuned_models_base_idx ON fine_tuned_models(base_model_id);

CREATE TABLE IF NOT EXISTS training_evaluators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  kind varchar(40) NOT NULL DEFAULT 'llm_judge', -- llm_judge | exact_match | custom
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_eval_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  evaluator_id uuid REFERENCES training_evaluators(id) ON DELETE SET NULL,
  dataset_id uuid REFERENCES training_datasets(id) ON DELETE SET NULL,
  model_id varchar(150) NOT NULL, -- base or ft:
  status varchar(30) NOT NULL DEFAULT 'queued',
  score numeric(8, 4),
  metrics jsonb,
  status_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_eval_jobs_org_idx ON training_eval_jobs(organization_id);
