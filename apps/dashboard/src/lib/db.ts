import { existsSync } from "fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@opendoor/database";

// Persist the client across Next.js HMR reloads in development.
const g = global as typeof global & {
  _pgClient?: postgres.Sql;
  _db?: ReturnType<typeof drizzle<typeof schema>>;
};

function cloudSqlInstanceIfReachable() {
  const instance =
    process.env.INSTANCE_CONNECTION_NAME || process.env.CLOUDSQL_CONNECTION_NAME;
  if (!instance) return null;
  const dir = `/cloudsql/${instance}`;
  if (existsSync(dir) || existsSync(`${dir}/.s.PGSQL.5432`)) return instance;
  return null;
}

function createClient(poolMax: number) {
  const instance = cloudSqlInstanceIfReachable();

  if (instance) {
    let password = process.env.DB_PASSWORD || "";
    if (!password && process.env.DATABASE_URL) {
      const m = process.env.DATABASE_URL.match(
        /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@/i
      );
      if (m) password = decodeURIComponent(m[2]);
    }
    if (!password) {
      throw new Error("Cloud SQL: set DB_PASSWORD or password in DATABASE_URL");
    }
    return postgres({
      host: `/cloudsql/${instance}`,
      database: process.env.DB_NAME || "opendoor",
      username: process.env.DB_USER || "opendoor",
      password,
      max: poolMax,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => undefined,
    });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not defined");
  return postgres(connectionString, {
    max: poolMax,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
}

export function getDb() {
  if (g._db) return g._db;

  const poolMax = Number(
    process.env.DB_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 5 : 4)
  );
  g._pgClient = createClient(poolMax);
  g._db = drizzle(g._pgClient, { schema });
  return g._db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});
