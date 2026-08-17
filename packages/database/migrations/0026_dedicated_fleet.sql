-- Dedicated deployment Fireworks-parity: autoscaling + scale-to-zero + LoRA slots
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS min_replicas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_replicas integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS scale_to_zero boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS autoscaling_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS precision varchar(20) DEFAULT 'fp16',
  ADD COLUMN IF NOT EXISTS weights_uri text,
  ADD COLUMN IF NOT EXISTS region_locked boolean NOT NULL DEFAULT false;

-- Multi-LoRA adapters attached to a running deployment
CREATE TABLE IF NOT EXISTS deployment_loras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  adapter_uri text NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending',
  loaded_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deployment_loras_deployment_idx ON deployment_loras(deployment_id);

-- Simple A/B deployment routers (traffic split across deployments)
CREATE TABLE IF NOT EXISTS deployment_routers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  slug varchar(100) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS deployment_router_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL REFERENCES deployment_routers(id) ON DELETE CASCADE,
  deployment_id uuid NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  weight integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deployment_router_targets_router_idx ON deployment_router_targets(router_id);
