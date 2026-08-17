-- List Qwen3.8-Max so workspaces can call the hosted id or import the HF repo.

INSERT INTO model_catalog (
  model_id, display_name, description, hf_repo, inference_engine,
  default_cpu, default_memory_gb, origin, source, deployment_status, serverless, listed_at, enabled
)
VALUES (
  'qwen3-8-2-4t-a95b',
  'Qwen3.8 2.4T A95B',
  'Qwen3.8 open-weight MoE (2.4T total, 95B active). Too large for laptop/L4 self-serve. Import to list; serve qwen3.8-max via DashScope when QWEN_API_KEY is set, or request reserved GPU.',
  'Qwen/Qwen3.8-2.4T-A95B',
  'vllm',
  '4.0',
  '16.0',
  'cn',
  'huggingface',
  'warming',
  false,
  NOW(),
  true
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  hf_repo = EXCLUDED.hf_repo,
  listed_at = NOW(),
  enabled = true;

INSERT INTO models (
  provider_id, model_id, display_name, context_window, family, deployment_status,
  serverless, origin, source, hf_repo, listed_at, enabled
)
SELECT
  p.id,
  'qwen3.8-max',
  'Qwen3.8 Max',
  1000000,
  'closed',
  'live',
  true,
  'cn',
  'provider_api',
  'Qwen/Qwen3.8-2.4T-A95B',
  NOW(),
  true
FROM providers p
WHERE p.slug = 'qwen'
ON CONFLICT (provider_id, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  hf_repo = EXCLUDED.hf_repo,
  listed_at = NOW(),
  enabled = true;

INSERT INTO pricing_rules (
  provider_id, model_id, region,
  input_cost_per_1k, output_cost_per_1k, markup_percent,
  final_input_cost_per_1k, final_output_cost_per_1k
)
SELECT
  p.id,
  'qwen3.8-max',
  'global',
  0.002,
  0.006,
  10,
  0.0022,
  0.0066
FROM providers p
WHERE p.slug = 'qwen'
  AND NOT EXISTS (
    SELECT 1 FROM pricing_rules pr
    WHERE pr.provider_id = p.id AND pr.model_id = 'qwen3.8-max'
  );
