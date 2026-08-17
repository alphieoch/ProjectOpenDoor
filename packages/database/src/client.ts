import { existsSync } from "fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: postgres.Sql | null = null;

function cloudSqlOptions(poolMax: number) {
  const instance =
    process.env.INSTANCE_CONNECTION_NAME || process.env.CLOUDSQL_CONNECTION_NAME;
  if (!instance) return null;
  const dir = `/cloudsql/${instance}`;
  if (!existsSync(dir) && !existsSync(`${dir}/.s.PGSQL.5432`)) return null;

  const database = process.env.DB_NAME || "opendoor";
  const username = process.env.DB_USER || "opendoor";
  let password = process.env.DB_PASSWORD || "";

  if (!password && process.env.DATABASE_URL) {
    // postgresql://user:pass@host/db — extract password without URL()
    const m = process.env.DATABASE_URL.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@/i);
    if (m) {
      password = decodeURIComponent(m[2]);
    }
  }

  if (!password) {
    throw new Error(
      "Cloud SQL configured but DB_PASSWORD (or password in DATABASE_URL) is missing"
    );
  }

  return {
    host: `/cloudsql/${instance}`,
    database,
    username,
    password,
    max: poolMax,
    idle_timeout: 20,
    connect_timeout: 10,
  } as const;
}

export function getDb() {
  if (_db) return _db;

  const poolMax = Number(
    process.env.DB_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 10 : 2)
  );

  const cloud = cloudSqlOptions(poolMax);
  if (cloud) {
    _client = postgres(cloud);
  } else {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not defined");
    }
    _client = postgres(connectionString, {
      max: poolMax,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  _db = drizzle(_client, { schema });
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});
