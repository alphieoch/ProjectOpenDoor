import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@opendoor/database';

// Persist the client across Next.js HMR reloads in development.
// Without this, every hot reload creates a new postgres() client and
// abandons the old one without closing it, exhausting Postgres max_connections.
const g = global as typeof global & {
  _pgClient?: postgres.Sql;
  _db?: ReturnType<typeof drizzle<typeof schema>>;
};

export function getDb() {
  if (g._db) return g._db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not defined');
  const poolMax = Number(process.env.DB_POOL_MAX ?? (process.env.NODE_ENV === 'production' ? 5 : 1));

  g._pgClient = postgres(connectionString, {
    max: poolMax,    // keep dev pool tiny to avoid exhausting local Postgres during HMR
    idle_timeout: 20, // release idle connections after 20 s
    connect_timeout: 10,
  });
  g._db = drizzle(g._pgClient, { schema });
  return g._db;
}

// Proxy for backward-compatible default import
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});
