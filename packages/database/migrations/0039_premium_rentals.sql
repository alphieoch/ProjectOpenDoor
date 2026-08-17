-- Private GPU rentals (this Mac / existing dedicated deployment). No region lock.

CREATE TABLE IF NOT EXISTS premium_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  sku VARCHAR(50) NOT NULL DEFAULT 'metal',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  hourly_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
  hours INTEGER,
  model_id VARCHAR(255),
  weights_uri TEXT,
  owns_deployment BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS premium_rentals_org_idx
  ON premium_rentals (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS premium_rentals_status_idx
  ON premium_rentals (status);
