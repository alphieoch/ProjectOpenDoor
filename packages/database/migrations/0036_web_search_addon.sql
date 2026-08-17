ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS web_search_addon_status varchar(50) NOT NULL DEFAULT 'inactive';
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_web_search_subscription_id varchar(255);
