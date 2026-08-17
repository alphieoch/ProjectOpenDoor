-- GPU request + GCP / local runtime fields for self-hosted deployments

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS target VARCHAR(20) NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS gpu_type VARCHAR(50) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS gpu_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS local_runtime VARCHAR(50),
  ADD COLUMN IF NOT EXISTS runtime_model VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gcp_resource_id TEXT;

ALTER TABLE model_catalog
  ADD COLUMN IF NOT EXISTS ollama_tag VARCHAR(100),
  ADD COLUMN IF NOT EXISTS min_gpu_memory_gb NUMERIC(4,1);

INSERT INTO model_catalog (
  model_id, display_name, description, hf_repo, ollama_tag,
  inference_engine, default_cpu, default_memory_gb, min_gpu_memory_gb
)
VALUES
  (
    'llama-3.2-3b-instruct',
    'Llama 3.2 3B Instruct',
    'Small instruction model that runs on this Mac (Apple Silicon / Metal) via Ollama. Best first GPU request.',
    'meta-llama/Llama-3.2-3B-Instruct',
    'llama3.2:3b',
    'ollama',
    '2.0',
    '4.0',
    '4.0'
  )
ON CONFLICT (model_id) DO UPDATE SET
  ollama_tag = EXCLUDED.ollama_tag,
  inference_engine = EXCLUDED.inference_engine,
  min_gpu_memory_gb = EXCLUDED.min_gpu_memory_gb;

UPDATE model_catalog SET ollama_tag = 'llama3.1:8b' WHERE model_id = 'llama-3.1-8b-instruct' AND ollama_tag IS NULL;
UPDATE model_catalog SET ollama_tag = 'mistral:7b' WHERE model_id = 'mistral-7b-instruct' AND ollama_tag IS NULL;
UPDATE model_catalog SET ollama_tag = 'qwen2.5:7b' WHERE model_id = 'qwen2.5-7b-instruct' AND ollama_tag IS NULL;
UPDATE model_catalog SET ollama_tag = 'gemma2:9b' WHERE model_id = 'gemma-2-9b-it' AND ollama_tag IS NULL;
