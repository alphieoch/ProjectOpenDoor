CREATE TABLE IF NOT EXISTS "device_inventory_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "granted" boolean NOT NULL DEFAULT false,
  "purpose" text NOT NULL,
  "version" varchar(50) NOT NULL,
  "granted_at" timestamptz,
  "withdrawn_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_inventory_consents_user_idx"
  ON "device_inventory_consents" ("user_id");
CREATE INDEX IF NOT EXISTS "device_inventory_consents_org_idx"
  ON "device_inventory_consents" ("organization_id");
