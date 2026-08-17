-- Columns the gateway/dashboard Drizzle schema selects on organizations/requests.
-- Cloud SQL was missing later migrations; house chat 500'd on org load.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS welcome_credits_usd_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welcome_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS agents_addon_status varchar(50) NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS stripe_agents_subscription_id varchar(255),
  ADD COLUMN IF NOT EXISTS custom_domain varchar(255),
  ADD COLUMN IF NOT EXISTS custom_domain_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_invites boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_billing_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS data_residency varchar(50) DEFAULT 'uk';

DO $$ BEGIN
  CREATE TYPE "public"."sector" AS ENUM('general', 'legal', 'finance', 'property', 'healthcare', 'government');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN sector "sector" NOT NULL DEFAULT 'general';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."data_class" AS ENUM('public', 'internal', 'confidential', 'restricted');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS data_class "data_class" DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS policy_violation_id uuid,
  ADD COLUMN IF NOT EXISTS guardrail_outcome jsonb;
