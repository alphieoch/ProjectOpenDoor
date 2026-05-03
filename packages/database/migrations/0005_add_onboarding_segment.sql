DO $$
BEGIN
  CREATE TYPE organization_segment AS ENUM ('standard', 'education', 'enterprise_intent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS onboarding_segment organization_segment NOT NULL DEFAULT 'standard';
