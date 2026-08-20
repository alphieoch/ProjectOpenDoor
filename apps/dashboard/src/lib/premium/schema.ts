import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/** Bump when DDL is added so HMR cannot skip new ALTER/CREATE after a stale ready flag. */
export const PREMIUM_GPU_SCHEMA_VERSION = 2;

const g = global as typeof global & { _premiumGpuSchemaVersion?: number };

export function resetPremiumGpuSchemaCache() {
  g._premiumGpuSchemaVersion = undefined;
}

export function isMissingRelationOrColumn(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /relation .+ does not exist|undefined table|column .+ does not exist/i.test(message);
}

export function premiumPageError(err: unknown, fallback = "Could not load rentals"): string {
  const message = (err instanceof Error ? err.message : String(err)).trim();
  if (!message) return fallback;
  if (isMissingRelationOrColumn(err)) {
    return `${fallback}: ${message}. GPU tables are created automatically — refresh once.`;
  }
  return message;
}

export async function ensurePremiumGpuSchema() {
  if (g._premiumGpuSchemaVersion === PREMIUM_GPU_SCHEMA_VERSION) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS premium_rentals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      deployment_id uuid REFERENCES deployments(id) ON DELETE SET NULL,
      sku varchar(50) NOT NULL DEFAULT 'metal',
      status varchar(30) NOT NULL DEFAULT 'pending',
      hourly_rate numeric(10,4) NOT NULL DEFAULT 0,
      hours integer,
      model_id varchar(255),
      weights_uri text,
      owns_deployment boolean NOT NULL DEFAULT false,
      earnings_cents integer NOT NULL DEFAULT 0,
      started_at timestamptz,
      ended_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS premium_rentals_org_idx
    ON premium_rentals (organization_id, created_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS premium_rentals_status_idx
    ON premium_rentals (status)
  `);
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS gpu_host_shares_org_idx
    ON gpu_host_shares (organization_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS gpu_host_shares_listed_idx
    ON gpu_host_shares (status, listed_at)
  `);
  await db.execute(sql`
    ALTER TABLE premium_rentals
    ADD COLUMN IF NOT EXISTS host_share_id uuid REFERENCES gpu_host_shares(id) ON DELETE SET NULL
  `);
  await db.execute(sql`
    ALTER TABLE premium_rentals
    ADD COLUMN IF NOT EXISTS earnings_cents integer NOT NULL DEFAULT 0
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS premium_rentals_host_share_idx
    ON premium_rentals (host_share_id)
  `);
  g._premiumGpuSchemaVersion = PREMIUM_GPU_SCHEMA_VERSION;
}

export async function withEnsuredSchema<T>(
  run: () => Promise<T>,
  opts?: {
    ensure?: () => Promise<void>;
    reset?: () => void;
  },
): Promise<T> {
  const ensure = opts?.ensure ?? ensurePremiumGpuSchema;
  const reset = opts?.reset ?? resetPremiumGpuSchemaCache;
  await ensure();
  try {
    return await run();
  } catch (err) {
    if (!isMissingRelationOrColumn(err)) throw err;
    reset();
    await ensure();
    return await run();
  }
}
