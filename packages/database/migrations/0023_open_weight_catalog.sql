-- Open-weight catalog fields: origin, source, listing status

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'provider_api',
  ADD COLUMN IF NOT EXISTS hf_repo VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ollama_tag VARCHAR(100),
  ADD COLUMN IF NOT EXISTS listed_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE model_catalog
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'huggingface',
  ADD COLUMN IF NOT EXISTS deployment_status VARCHAR(30) NOT NULL DEFAULT 'warming',
  ADD COLUMN IF NOT EXISTS listed_at TIMESTAMPTZ DEFAULT NOW();

-- Prefer live default for open-weight going forward; leave existing rows alone unless empty
UPDATE models SET deployment_status = 'live'
WHERE family = 'open_weight' AND (deployment_status IS NULL OR deployment_status = 'available_on_request');
