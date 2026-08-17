-- Keep Qwen 3.8 Max listed as a hosted DashScope SKU (no self-serve GPU).

INSERT INTO model_catalog (
  model_id, display_name, description, hf_repo, inference_engine,
  default_cpu, default_memory_gb, origin, source, deployment_status, serverless, listed_at, enabled
)
VALUES (
  'qwen3.8-max',
  'Qwen 3.8 Max',
  'Hosted Qwen3.8 Max via DashScope (2.4T MoE). Pay-per-token — not pulled onto Cloud Run L4.',
  'Qwen/Qwen3.8-2.4T-A95B',
  'dashscope',
  '0.0',
  '0.0',
  'cn',
  'provider_api',
  'live',
  true,
  NOW(),
  true
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  deployment_status = 'live',
  serverless = true,
  source = 'provider_api',
  listed_at = NOW(),
  enabled = true;

INSERT INTO models (
  provider_id, model_id, display_name, context_window, family, deployment_status,
  serverless, origin, source, hf_repo, listed_at, enabled, supports_vision, supports_tools
)
SELECT
  p.id,
  'qwen3.8-max',
  'Qwen 3.8 Max',
  1000000,
  'closed',
  'live',
  true,
  'cn',
  'provider_api',
  'Qwen/Qwen3.8-2.4T-A95B',
  NOW(),
  true,
  true,
  true
FROM providers p
WHERE p.slug = 'qwen'
ON CONFLICT (provider_id, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  deployment_status = 'live',
  serverless = true,
  family = 'closed',
  listed_at = NOW(),
  enabled = true,
  supports_vision = true,
  supports_tools = true;

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
