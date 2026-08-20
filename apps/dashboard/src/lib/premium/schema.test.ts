import { describe, expect, test } from "bun:test";
import {
  isMissingRelationOrColumn,
  premiumPageError,
  withEnsuredSchema,
} from "./schema";

describe("premium schema errors", () => {
  test("detects missing tables and columns from Postgres", () => {
    expect(isMissingRelationOrColumn(new Error('column "host_share_id" does not exist'))).toBe(true);
    expect(isMissingRelationOrColumn(new Error('column "earnings_cents" does not exist'))).toBe(true);
    expect(isMissingRelationOrColumn(new Error('relation "gpu_host_shares" does not exist'))).toBe(true);
    expect(isMissingRelationOrColumn(new Error('relation "premium_rentals" does not exist'))).toBe(true);
    expect(isMissingRelationOrColumn(new Error("undefined table"))).toBe(true);
    expect(isMissingRelationOrColumn(new Error("connection refused"))).toBe(false);
  });

  test("maps schema misses to a useful UI message that keeps the real detail", () => {
    const message = premiumPageError(new Error('column "host_share_id" does not exist'));
    expect(message).toContain("host_share_id");
    expect(message.toLowerCase()).toContain("refresh");
    expect(premiumPageError(new Error("GCP_PROJECT_ID is not set"))).toBe("GCP_PROJECT_ID is not set");
    expect(premiumPageError(new Error("   "))).toBe("Could not load rentals");
  });

  test("retries once after a missing-column error", async () => {
    let ensures = 0;
    let runs = 0;
    let reset = 0;
    const value = await withEnsuredSchema(
      async () => {
        runs += 1;
        if (runs === 1) throw new Error('column "host_share_id" does not exist');
        return "ok";
      },
      {
        ensure: async () => {
          ensures += 1;
        },
        reset: () => {
          reset += 1;
        },
      },
    );
    expect(value).toBe("ok");
    expect(ensures).toBe(2);
    expect(runs).toBe(2);
    expect(reset).toBe(1);
  });

  test("does not retry unrelated failures", async () => {
    let ensures = 0;
    await expect(
      withEnsuredSchema(
        async () => {
          throw new Error("connection refused");
        },
        {
          ensure: async () => {
            ensures += 1;
          },
        },
      ),
    ).rejects.toThrow("connection refused");
    expect(ensures).toBe(1);
  });
});
