DO $$ BEGIN
 CREATE TYPE "public"."approval_status" AS ENUM('pending', 'in_review', 'approved', 'rejected', 'deprecated');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."compliance_framework" AS ENUM('gdpr', 'eu_ai_act', 'nist_ai_rmf', 'ico_uk', 'iso_42001');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."data_class" AS ENUM('public', 'internal', 'confidential', 'restricted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."deployment_status" AS ENUM('pending', 'building', 'running', 'stopped', 'failed', 'deleting');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."policy_action" AS ENUM('allow', 'deny', 'require_approval', 'route_fallback');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."request_status" AS ENUM('success', 'error', 'cached');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."request_type" AS ENUM('chat', 'embedding', 'image');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high', 'critical');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sector" AS ENUM('general', 'legal', 'finance', 'property', 'healthcare', 'government');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_key_id" uuid,
	"agent_name" varchar(255) NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"thread_id" varchar(255),
	"status" varchar(50) DEFAULT 'running' NOT NULL,
	"prompt_tokens" integer DEFAULT 0,
	"completion_tokens" integer DEFAULT 0,
	"cost_usd" numeric(12, 8) DEFAULT '0',
	"tools_used" jsonb DEFAULT '[]'::jsonb,
	"steps" jsonb,
	"guardrail_outcomes" jsonb,
	"human_approval_required" boolean DEFAULT false,
	"human_approved_by" uuid,
	"human_approved_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"organization_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"allowed_models" jsonb,
	"rate_limit_rpm" integer DEFAULT 60,
	"rate_limit_tpm" integer DEFAULT 100000,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100),
	"entity_id" varchar(255),
	"metadata" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework" "compliance_framework" NOT NULL,
	"control_code" varchar(100) NOT NULL,
	"control_name" varchar(255) NOT NULL,
	"description" text,
	"requirement_level" varchar(50) DEFAULT 'required',
	"guidance" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"source_value" text NOT NULL,
	"cpu" numeric(4, 2) DEFAULT '0.5' NOT NULL,
	"memory_gb" numeric(4, 1) DEFAULT '1.0' NOT NULL,
	"replicas" integer DEFAULT 1 NOT NULL,
	"container_app_name" varchar(100),
	"fqdn" text,
	"azure_resource_id" text,
	"status" "deployment_status" DEFAULT 'pending' NOT NULL,
	"status_message" text,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"compute_hours_billed" numeric(12, 4) DEFAULT '0',
	"compute_cost_usd" numeric(12, 4) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guardrail_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid,
	"agent_run_id" uuid,
	"organization_id" uuid NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"guardrail_type" varchar(100) NOT NULL,
	"triggered" boolean DEFAULT false NOT NULL,
	"severity" "risk_level" DEFAULT 'low',
	"details" jsonb,
	"action_taken" varchar(100) DEFAULT 'none',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"token" varchar(255) NOT NULL,
	"invited_by" uuid,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_governance_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"hf_repo" varchar(255),
	"inference_engine" varchar(50) DEFAULT 'vllm' NOT NULL,
	"default_cpu" numeric(4, 2) DEFAULT '1.0' NOT NULL,
	"default_memory_gb" numeric(4, 1) DEFAULT '2.0' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_catalog_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_compliance_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_governance_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'not_assessed' NOT NULL,
	"evidence" text,
	"assessed_by" uuid,
	"assessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_governance_id" uuid NOT NULL,
	"organization_id" uuid,
	"evaluation_name" varchar(255) NOT NULL,
	"evaluation_type" varchar(100) NOT NULL,
	"score" numeric(6, 3),
	"score_unit" varchar(50) DEFAULT 'percent',
	"pass_threshold" numeric(6, 3),
	"passed" boolean,
	"details" jsonb,
	"dataset_ref" text,
	"evaluated_by" uuid,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_governance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"provider_id" uuid,
	"approval_status" "approval_status" DEFAULT 'pending' NOT NULL,
	"risk_level" "risk_level" DEFAULT 'medium' NOT NULL,
	"business_labels" jsonb DEFAULT '[]'::jsonb,
	"allowed_use_cases" jsonb DEFAULT '[]'::jsonb,
	"banned_use_cases" jsonb DEFAULT '[]'::jsonb,
	"data_classes_allowed" jsonb DEFAULT '["public","internal"]'::jsonb,
	"license_type" varchar(100),
	"license_url" text,
	"provenance_verified" boolean DEFAULT false,
	"bias_reviewed" boolean DEFAULT false,
	"safety_reviewed" boolean DEFAULT false,
	"red_team_results" jsonb,
	"context_window" integer,
	"parameter_scale" varchar(50),
	"reasoning_modes" jsonb DEFAULT '[]'::jsonb,
	"cost_tier" varchar(50) DEFAULT 'standard',
	"sector_tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_governance_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"data_class" "data_class" NOT NULL,
	"model_governance_id" uuid,
	"model_id_pattern" varchar(255),
	"user_role_pattern" varchar(255),
	"action" "policy_action" DEFAULT 'allow' NOT NULL,
	"fallback_model_id" varchar(100),
	"require_human_approval" boolean DEFAULT false,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"display_name" varchar(255),
	"owned_by" varchar(100),
	"context_window" integer,
	"supports_vision" boolean DEFAULT false,
	"supports_tools" boolean DEFAULT false,
	"supports_json_mode" boolean DEFAULT false,
	"enabled" boolean DEFAULT true NOT NULL,
	"deployment_status" varchar(30) DEFAULT 'available_on_request',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"plan" varchar(50) DEFAULT 'free' NOT NULL,
	"monthly_budget_usd" numeric(10, 2) DEFAULT '0',
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"stripe_price_id" varchar(255),
	"subscription_status" varchar(50) DEFAULT 'inactive',
	"workos_organization_id" varchar(255),
	"workos_connection_id" varchar(255),
	"sso_enabled" boolean DEFAULT false,
	"sso_default_role" varchar(50) DEFAULT 'member',
	"metadata" jsonb,
	"sector" "sector" DEFAULT 'general' NOT NULL,
	"data_residency" varchar(50) DEFAULT 'uk',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policy_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"policy_id" uuid,
	"api_key_id" uuid,
	"model_id" varchar(100) NOT NULL,
	"data_class" "data_class" NOT NULL,
	"violation_type" varchar(100) NOT NULL,
	"severity" "risk_level" DEFAULT 'medium' NOT NULL,
	"action_taken" varchar(100) NOT NULL,
	"details" jsonb,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"region" varchar(50) DEFAULT 'global' NOT NULL,
	"input_cost_per_1k" numeric(12, 8) NOT NULL,
	"output_cost_per_1k" numeric(12, 8) NOT NULL,
	"markup_percent" numeric(5, 2) NOT NULL,
	"final_input_cost_per_1k" numeric(12, 8) NOT NULL,
	"final_output_cost_per_1k" numeric(12, 8) NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"base_url" text,
	"api_key_env_var" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"region" varchar(50),
	"is_western" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"request_type" "request_type" DEFAULT 'chat' NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 8) DEFAULT '0' NOT NULL,
	"status" "request_status" DEFAULT 'success' NOT NULL,
	"error_message" text,
	"data_class" "data_class" DEFAULT 'internal',
	"policy_violation_id" uuid,
	"guardrail_outcome" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"region" varchar(50) DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sector_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector" "sector" NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"default_models" jsonb DEFAULT '[]'::jsonb,
	"default_policies" jsonb,
	"prompt_templates" jsonb,
	"guardrail_config" jsonb,
	"compliance_requirements" jsonb DEFAULT '[]'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 8) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"password_hash" text,
	"organization_id" uuid,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_human_approved_by_users_id_fk" FOREIGN KEY ("human_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployments" ADD CONSTRAINT "deployments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guardrail_outcomes" ADD CONSTRAINT "guardrail_outcomes_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guardrail_outcomes" ADD CONSTRAINT "guardrail_outcomes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_approvals" ADD CONSTRAINT "model_approvals_model_governance_id_model_governance_id_fk" FOREIGN KEY ("model_governance_id") REFERENCES "public"."model_governance"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_approvals" ADD CONSTRAINT "model_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_approvals" ADD CONSTRAINT "model_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_approvals" ADD CONSTRAINT "model_approvals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_compliance_mappings" ADD CONSTRAINT "model_compliance_mappings_model_governance_id_model_governance_id_fk" FOREIGN KEY ("model_governance_id") REFERENCES "public"."model_governance"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_compliance_mappings" ADD CONSTRAINT "model_compliance_mappings_control_id_compliance_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."compliance_controls"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_compliance_mappings" ADD CONSTRAINT "model_compliance_mappings_assessed_by_users_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_evaluations" ADD CONSTRAINT "model_evaluations_model_governance_id_model_governance_id_fk" FOREIGN KEY ("model_governance_id") REFERENCES "public"."model_governance"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_evaluations" ADD CONSTRAINT "model_evaluations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_evaluations" ADD CONSTRAINT "model_evaluations_evaluated_by_users_id_fk" FOREIGN KEY ("evaluated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_governance" ADD CONSTRAINT "model_governance_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_policies" ADD CONSTRAINT "model_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_policies" ADD CONSTRAINT "model_policies_model_governance_id_model_governance_id_fk" FOREIGN KEY ("model_governance_id") REFERENCES "public"."model_governance"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_policy_id_model_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."model_policies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_org_idx" ON "agent_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_created_at_idx" ON "agent_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_org_idx" ON "audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compliance_framework_code_idx" ON "compliance_controls" USING btree ("framework","control_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_org_idx" ON "deployments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_status_idx" ON "deployments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guardrails_org_idx" ON "guardrail_outcomes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guardrails_type_idx" ON "guardrail_outcomes" USING btree ("guardrail_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guardrails_triggered_idx" ON "guardrail_outcomes" USING btree ("triggered");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_org_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_idx" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_model_org_idx" ON "model_approvals" USING btree ("model_governance_id","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_status_idx" ON "model_approvals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compliance_model_control_idx" ON "model_compliance_mappings" USING btree ("model_governance_id","control_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evals_model_idx" ON "model_evaluations" USING btree ("model_governance_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evals_type_idx" ON "model_evaluations" USING btree ("evaluation_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_approval_idx" ON "model_governance" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_risk_idx" ON "model_governance" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_org_idx" ON "model_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_enabled_idx" ON "model_policies" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "models_provider_model_idx" ON "models" USING btree ("provider_id","model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "violations_org_idx" ON "policy_violations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "violations_severity_idx" ON "policy_violations" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "violations_created_at_idx" ON "policy_violations" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_provider_model_region_idx" ON "pricing_rules" USING btree ("provider_id","model_id","region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_org_idx" ON "requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_created_at_idx" ON "requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_provider_model_idx" ON "requests" USING btree ("provider_id","model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_sector_idx" ON "sector_templates" USING btree ("sector");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_daily_org_date_idx" ON "usage_daily" USING btree ("organization_id","date","provider_id","model_id");