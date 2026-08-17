ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'insurance';
ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'education';
ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'energy';
ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'retail';
ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'media';
ALTER TYPE "sector" ADD VALUE IF NOT EXISTS 'transport';

ALTER TABLE "model_governance" ADD COLUMN IF NOT EXISTS "owner_team" varchar(255);
ALTER TABLE "model_governance" ADD COLUMN IF NOT EXISTS "business_criticality" varchar(50) DEFAULT 'standard';
ALTER TABLE "model_governance" ADD COLUMN IF NOT EXISTS "allowed_regions" jsonb DEFAULT '["uk","eu"]'::jsonb;
ALTER TABLE "model_governance" ADD COLUMN IF NOT EXISTS "last_reviewed_by" uuid;
ALTER TABLE "model_governance" ADD COLUMN IF NOT EXISTS "last_reviewed_at" timestamptz;
ALTER TABLE "model_policies" ADD COLUMN IF NOT EXISTS "scope" varchar(50) DEFAULT 'organization' NOT NULL;

CREATE TABLE IF NOT EXISTS "compliance_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id"),
  "name" varchar(255) NOT NULL,
  "description" text,
  "framework" "compliance_framework",
  "control_code" varchar(50),
  "rule_type" varchar(50) NOT NULL DEFAULT 'model_attribute',
  "rule_config" jsonb,
  "severity" varchar(50) NOT NULL DEFAULT 'medium',
  "recommendation" text,
  "reference_url" text,
  "reference_name" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "compliance_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id"),
  "model_governance_id" uuid REFERENCES "model_governance"("id"),
  "title" varchar(255) NOT NULL,
  "description" text,
  "framework" "compliance_framework",
  "status_summary" jsonb,
  "findings" jsonb,
  "recommendations" jsonb,
  "score" integer,
  "passed" boolean DEFAULT false,
  "generated_at" timestamptz NOT NULL DEFAULT now(),
  "generated_by" uuid REFERENCES "users"("id")
);
