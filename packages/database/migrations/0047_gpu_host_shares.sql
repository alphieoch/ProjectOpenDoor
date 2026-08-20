-- Org-owned GPU listings so others can rent this host while the owner is away.
-- Earnings live on the listing and on each rental row. GCP/Postgres — not Supabase.

CREATE TABLE IF NOT EXISTS gpu_host_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  host_key varchar(80) NOT NULL DEFAULT 'this-host',
  status varchar(20) NOT NULL DEFAULT 'unlisted',
  sku varchar(50) NOT NULL DEFAULT 'metal',
  hourly_usd numeric(10,4) NOT NULL,
  display_name varchar(120) NOT NULL,
  chip varchar(160),
  gpu_name varchar(160),
  memory_gb integer,
  worker_kind varchar(40),
  is_demo boolean NOT NULL DEFAULT false,
  earnings_cents integer NOT NULL DEFAULT 0,
  listed_by uuid REFERENCES users(id),
  listed_at timestamptz,
  unlisted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, host_key)
);

CREATE INDEX IF NOT EXISTS gpu_host_shares_org_idx
  ON gpu_host_shares (organization_id);

CREATE INDEX IF NOT EXISTS gpu_host_shares_listed_idx
  ON gpu_host_shares (status, listed_at);

ALTER TABLE premium_rentals
  ADD COLUMN IF NOT EXISTS host_share_id uuid REFERENCES gpu_host_shares(id) ON DELETE SET NULL;

ALTER TABLE premium_rentals
  ADD COLUMN IF NOT EXISTS earnings_cents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS premium_rentals_host_share_idx
  ON premium_rentals (host_share_id);
