CREATE TABLE IF NOT EXISTS "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"balance_after_cents" bigint NOT NULL,
	"request_id" uuid,
	"stripe_payment_intent_id" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "decision_trace" jsonb;--> statement-breakpoint
ALTER TABLE "model_governance" ADD COLUMN "owner_team" varchar(255);--> statement-breakpoint
ALTER TABLE "model_governance" ADD COLUMN "business_criticality" varchar(50) DEFAULT 'standard';--> statement-breakpoint
ALTER TABLE "model_governance" ADD COLUMN "allowed_regions" jsonb DEFAULT '["uk","eu"]'::jsonb;--> statement-breakpoint
ALTER TABLE "model_governance" ADD COLUMN "last_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "model_governance" ADD COLUMN "last_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "model_policies" ADD COLUMN "scope" varchar(50) DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "family" varchar(20) DEFAULT 'closed' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "credits_usd_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "signup_credit_granted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_recharge_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_recharge_threshold_cents" bigint;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_recharge_amount_cents" bigint;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_payment_method_id" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_site_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transactions_org_created_idx" ON "credit_transactions" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_transactions_payment_intent_idx" ON "credit_transactions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_governance" ADD CONSTRAINT "model_governance_last_reviewed_by_users_id_fk" FOREIGN KEY ("last_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
