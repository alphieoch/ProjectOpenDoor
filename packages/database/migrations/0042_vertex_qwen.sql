-- Vertex Qwen 3 Next (MaaS). House chat uses these instead of DashScope qwen3.8-max.

INSERT INTO providers (name, slug, api_key_env_var, enabled, is_western)
VALUES ('Vertex AI (Model Garden)', 'vertex', 'GOOGLE_CLOUD_PROJECT', true, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  enabled = true;

INSERT INTO models (
  provider_id, model_id, display_name, context_window, family, deployment_status,
  serverless, origin, source, listed_at, enabled, supports_tools
)
SELECT p.id, v.model_id, v.display_name, 262144, 'open_weight', 'live',
  true, 'global', 'provider_api', NOW(), true, true
FROM providers p
CROSS JOIN (VALUES
  ('qwen3-next-80b-instruct', 'Qwen3 Next 80B Instruct'),
  ('qwen3-next-80b-thinking', 'Qwen3 Next 80B Thinking'),
  ('qwen3-coder-480b-a35b-instruct', 'Qwen3 Coder 480B')
) AS v(model_id, display_name)
WHERE p.slug = 'vertex'
ON CONFLICT (provider_id, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  deployment_status = 'live',
  serverless = true,
  listed_at = NOW(),
  enabled = true;

INSERT INTO pricing_rules (
  provider_id, model_id, region,
  input_cost_per_1k, output_cost_per_1k, markup_percent,
  final_input_cost_per_1k, final_output_cost_per_1k
)
SELECT
  p.id,
  v.model_id,
  'global',
  0.00015,
  0.0012,
  10,
  0.000165,
  0.00132
FROM providers p
CROSS JOIN (VALUES
  ('qwen3-next-80b-instruct'),
  ('qwen3-next-80b-thinking'),
  ('qwen3-coder-480b-a35b-instruct')
) AS v(model_id)
WHERE p.slug = 'vertex'
  AND NOT EXISTS (
    SELECT 1 FROM pricing_rules pr
    WHERE pr.provider_id = p.id AND pr.model_id = v.model_id
  );
