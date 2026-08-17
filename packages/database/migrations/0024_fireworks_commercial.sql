-- Fireworks-parity commercial surface: cached rates, serverless flag, GPU SKUs

ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS cached_input_cost_per_1k NUMERIC(12,8),
  ADD COLUMN IF NOT EXISTS final_cached_input_cost_per_1k NUMERIC(12,8),
  ADD COLUMN IF NOT EXISTS batch_multiplier NUMERIC(4,2) DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS modality VARCHAR(20) NOT NULL DEFAULT 'chat';

-- Cached = 50% of input when unset (honest placeholder until prompt cache ships)
UPDATE pricing_rules
SET
  cached_input_cost_per_1k = COALESCE(cached_input_cost_per_1k, input_cost_per_1k * 0.5),
  final_cached_input_cost_per_1k = COALESCE(
    final_cached_input_cost_per_1k,
    final_input_cost_per_1k * 0.5
  );

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS serverless BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE model_catalog
  ADD COLUMN IF NOT EXISTS serverless BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS gpu_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  hourly_usd NUMERIC(10,4) NOT NULL,
  region_multiplier NUMERIC(4,2) DEFAULT 1.00,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gpu_skus (sku, display_name, hourly_usd, region_multiplier, sort_order)
VALUES
  ('nvidia-l4', 'NVIDIA L4', 0.70, 1.00, 10),
  ('nvidia-a100', 'NVIDIA A100 80GB', 3.50, 1.00, 20),
  ('nvidia-h100', 'NVIDIA H100 80GB', 8.00, 1.50, 30)
ON CONFLICT (sku) DO UPDATE SET
  hourly_usd = EXCLUDED.hourly_usd,
  display_name = EXCLUDED.display_name,
  region_multiplier = EXCLUDED.region_multiplier;
