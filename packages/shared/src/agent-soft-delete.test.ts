import { describe, expect, test } from "bun:test";
import {
  AGENT_SOFT_DELETE_RETENTION_DAYS,
  AGENT_SOFT_DELETE_RETENTION_MS,
  agentPurgeAt,
  agentPurgeCutoff,
  daysLeftToRecover,
  isAgentPurgeDue,
} from "./agent-soft-delete";

describe("agent soft-delete retention", () => {
  const deletedAt = new Date("2026-08-13T12:00:00.000Z");

  test("purge is due after 7 days, not before", () => {
    expect(agentPurgeAt(deletedAt).toISOString()).toBe("2026-08-20T12:00:00.000Z");
    expect(isAgentPurgeDue(deletedAt, new Date("2026-08-20T11:59:59.000Z"))).toBe(false);
    expect(isAgentPurgeDue(deletedAt, new Date("2026-08-20T12:00:00.000Z"))).toBe(true);
    expect(agentPurgeCutoff(new Date("2026-08-20T12:00:00.000Z")).toISOString()).toBe(deletedAt.toISOString());
  });

  test("days left ceil to a full remaining day", () => {
    expect(daysLeftToRecover(deletedAt, deletedAt)).toBe(AGENT_SOFT_DELETE_RETENTION_DAYS);
    expect(daysLeftToRecover(deletedAt, new Date("2026-08-19T12:00:01.000Z"))).toBe(1);
    expect(daysLeftToRecover(deletedAt, new Date("2026-08-20T12:00:00.000Z"))).toBe(0);
    expect(AGENT_SOFT_DELETE_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
