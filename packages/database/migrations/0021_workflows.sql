CREATE TABLE "workflows" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "category" VARCHAR(100) NOT NULL DEFAULT 'general',
  "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
  "graph" JSONB DEFAULT '{"nodes":[],"edges":[]}',
  "tags" JSONB DEFAULT '[]',
  "created_by" UUID REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "workflows_org_idx" ON "workflows"("organization_id");
CREATE INDEX "workflows_status_idx" ON "workflows"("status");
