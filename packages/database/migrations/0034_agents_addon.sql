ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS agents_addon_status varchar(50) NOT NULL DEFAULT 'inactive';
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_agents_subscription_id varchar(255);
