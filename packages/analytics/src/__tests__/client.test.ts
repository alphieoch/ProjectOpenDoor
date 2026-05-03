import { describe, it, expect } from "bun:test";
import { DuckDBInstance } from "@duckdb/node-api";
import { DuckDBAnalyticsClient, getAnalyticsClient } from "../client.js";

describe("DuckDBAnalyticsClient", () => {
  it("can instantiate DuckDB and run a basic query", async () => {
    const instance = await DuckDBInstance.create(":memory:");
    const connection = await instance.connect();
    const reader = await connection.runAndReadAll("SELECT 42 AS fortytwo");
    const rows = await reader.getRowObjectsJson();
    expect(rows).toHaveLength(1);
    expect(rows[0].fortytwo).toBe(42);
    connection.closeSync();
    instance.closeSync();
  });

  it("can install postgres extension", async () => {
    const client = new DuckDBAnalyticsClient();
    (client as any).enabled = true;
    (client as any).databaseUrl = "postgres://fake:fake@localhost:5432/fake";

    // init() installs and loads postgres extension before attempting ATTACH
    try {
      await client.init();
    } catch (e) {
      // ATTACH will fail because there's no real postgres, but extension load should succeed
      const err = e as Error;
      expect(err.message).toContain("Unable to connect to Postgres");
    }
    client.closeSync();
  });

  it("returns correct singleton", () => {
    const c1 = getAnalyticsClient();
    const c2 = getAnalyticsClient();
    expect(c1).toBe(c2);
  });
});
