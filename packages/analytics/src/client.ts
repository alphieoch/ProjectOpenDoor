interface ParsedUrl {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

function parsePostgresUrl(url: string): ParsedUrl {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, ""),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      ssl: parsed.searchParams.get("sslmode") !== "disable",
    };
  } catch {
    throw new Error("Invalid DATABASE_URL format");
  }
}

function buildAttachString(parsed: ParsedUrl): string {
  let conn = `host=${parsed.host} port=${parsed.port} dbname=${parsed.database} user=${parsed.user} password=${parsed.password}`;
  if (parsed.ssl) {
    conn += " sslmode=require";
  }
  return conn;
}

export class DuckDBAnalyticsClient {
  private instance: any = null;
  private connection: any = null;
  private readonly databaseUrl: string;
  private readonly enabled: boolean;
  private initialized = false;

  constructor(databaseUrl?: string) {
    this.databaseUrl = databaseUrl || process.env.DATABASE_URL || "";
    this.enabled = process.env.DUCKDB_ANALYTICS_ENABLED === "true";
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async init(): Promise<void> {
    if (!this.enabled) return;
    if (this.initialized) return;
    if (!this.databaseUrl) {
      throw new Error("DATABASE_URL is required for DuckDB analytics");
    }

    try {
      const { DuckDBInstance } = await import("@duckdb/node-api");
      this.instance = await DuckDBInstance.create(":memory:");
      this.connection = await this.instance.connect();

      await this.connection.run("INSTALL postgres");
      await this.connection.run("LOAD postgres");

      const parsed = parsePostgresUrl(this.databaseUrl);
      const attachStr = buildAttachString(parsed);

      await this.connection.run(
        `ATTACH '${attachStr}' AS pg (TYPE postgres, READ_ONLY)`
      );

      this.initialized = true;
    } catch (err) {
      console.warn("[DuckDB] Initialization failed, analytics disabled:", err);
      this.initialized = false;
      throw err;
    }
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    if (!this.enabled || !this.initialized || !this.connection) {
      throw new Error("DuckDB analytics not initialized");
    }

    const reader = await this.connection.runAndReadAll(sql);
    const rows = await reader.getRowObjectsJson();
    return rows as T[];
  }

  async querySingle<T = Record<string, unknown>>(
    sql: string
  ): Promise<T | null> {
    const rows = await this.query<T>(sql);
    return rows[0] ?? null;
  }

  async *stream<T = Record<string, unknown>>(
    sql: string
  ): AsyncGenerator<T, void, unknown> {
    if (!this.enabled || !this.initialized || !this.connection) {
      throw new Error("DuckDB analytics not initialized");
    }

    const result = await this.connection.run(sql);
    for await (const row of result.yieldRowObjectJson()) {
      yield row as T;
    }
  }

  async copyTo(
    sql: string,
    destination: string,
    format: "csv" | "parquet" = "csv"
  ): Promise<void> {
    if (!this.enabled || !this.initialized || !this.connection) {
      throw new Error("DuckDB analytics not initialized");
    }

    let copySql: string;
    if (format === "csv") {
      copySql = `COPY (${sql}) TO '${destination}' (FORMAT CSV, HEADER)`;
    } else {
      copySql = `COPY (${sql}) TO '${destination}' (FORMAT PARQUET)`;
    }

    await this.connection.run(copySql);
  }

  closeSync(): void {
    if (this.connection) {
      this.connection.closeSync();
      this.connection = null;
    }
    if (this.instance) {
      this.instance.closeSync();
      this.instance = null;
    }
    this.initialized = false;
  }
}

// Singleton for app-wide reuse
let _globalClient: DuckDBAnalyticsClient | null = null;

export function getAnalyticsClient(): DuckDBAnalyticsClient {
  if (!_globalClient) {
    _globalClient = new DuckDBAnalyticsClient();
  }
  return _globalClient;
}

export async function withAnalyticsClient<T>(
  fn: (client: DuckDBAnalyticsClient) => Promise<T>
): Promise<T> {
  const client = getAnalyticsClient();
  await client.init();
  try {
    return await fn(client);
  } finally {
    // We don't close the singleton on every request to avoid re-initialization overhead
  }
}
