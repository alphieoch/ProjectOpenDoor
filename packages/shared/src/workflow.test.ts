import { describe, expect, test } from "bun:test";
import {
  assertPublicHttpsUrl,
  cronMatches,
  evaluateCondition,
  graphForLiveRun,
  interpolate,
  isPrivateHostname,
  nextCronRun,
  nextPublishedVersion,
  normalizeTrigger,
  parseCron,
  parseLoopItems,
  retryPolicy,
  slaBreached,
  slaDueAt,
  triggerMatchesEvent,
  triggerNeedsSecret,
  waitDurationMs,
} from "./workflow";

const ctx = {
  input: "hello world",
  query: "hello world",
  vars: { dept: "support", name: "Ada" },
  steps: { llm1: { text: "ok", status: "ok", passed: true } },
  payload: { record: { id: "42" } },
  item: "row-a",
  index: 2,
};

describe("workflow templates", () => {
  test("interpolates input, vars, steps, payload, and loop item", () => {
    expect(interpolate("{{input}} / {{vars.dept}} / {{steps.llm1.text}}", ctx)).toBe(
      "hello world / support / ok"
    );
    expect(interpolate("{{payload.record.id}} #{{index}} {{item}}", ctx)).toBe("42 #2 row-a");
    expect(interpolate("{{missing}}", ctx)).toBe("");
  });
});

describe("workflow triggers", () => {
  test("defaults unknown triggers to manual", () => {
    expect(normalizeTrigger(null)).toEqual({ type: "manual" });
    expect(normalizeTrigger({ type: "webhook", event: "x" }).type).toBe("webhook");
    expect(triggerNeedsSecret("webhook")).toBe(true);
    expect(triggerNeedsSecret("schedule")).toBe(false);
  });

  test("matches agent and record events when configured", () => {
    expect(triggerMatchesEvent({ type: "agent_event", event: "agent.completed" }, { event: "agent.completed" })).toBe(true);
    expect(triggerMatchesEvent({ type: "agent_event", event: "agent.completed" }, { event: "other" })).toBe(false);
    expect(triggerMatchesEvent({ type: "record", recordAction: "update" }, { action: "update" })).toBe(true);
    expect(triggerMatchesEvent({ type: "manual" }, {})).toBe(true);
  });
});

describe("workflow retry / wait / sla", () => {
  test("clamps retry policy", () => {
    expect(retryPolicy({ retryCount: 9, retryDelayMs: 99999, onError: "fail" })).toEqual({
      retries: 3,
      delayMs: 5000,
      onError: "fail",
    });
    expect(retryPolicy({})).toEqual({ retries: 0, delayMs: 250, onError: "continue" });
  });

  test("wait duration combines minutes and seconds and caps at a day", () => {
    expect(waitDurationMs({ waitSeconds: 12 })).toBe(12_000);
    expect(waitDurationMs({ waitMinutes: 1, waitSeconds: 5 })).toBe(65_000);
    expect(waitDurationMs({ waitMinutes: 99_000 })).toBe(24 * 60 * 60 * 1000);
  });

  test("SLA due and breach", () => {
    const from = new Date("2026-08-20T12:00:00.000Z");
    const due = slaDueAt(30, from);
    expect(due?.toISOString()).toBe("2026-08-20T12:30:00.000Z");
    expect(slaBreached(due, new Date("2026-08-20T12:29:59.000Z"))).toBe(false);
    expect(slaBreached(due, new Date("2026-08-20T12:30:01.000Z"))).toBe(true);
    expect(slaDueAt(0, from)).toBeNull();
  });
});

describe("workflow loop items", () => {
  test("parses JSON arrays and newline lists with a cap", () => {
    expect(parseLoopItems('["a","b"]')).toEqual(["a", "b"]);
    expect(parseLoopItems("one\n\ntwo\nthree")).toEqual(["one", "two", "three"]);
    expect(parseLoopItems(Array.from({ length: 30 }, (_, i) => `n${i}`).join("\n"), 5)).toHaveLength(5);
    expect(parseLoopItems("")).toEqual([]);
  });
});

describe("workflow versioning", () => {
  test("live runs use the published snapshot when present", () => {
    expect(nextPublishedVersion(2)).toBe(3);
    expect(nextPublishedVersion(null)).toBe(1);
    const live = graphForLiveRun({
      graph: { nodes: [{ id: "draft" }] },
      publishedGraph: { nodes: [{ id: "live" }] },
      publishedVersion: 2,
    });
    expect((live.nodes as { id: string }[])[0].id).toBe("live");
    const draft = graphForLiveRun({ graph: { nodes: [{ id: "draft" }] }, publishedVersion: 0 });
    expect((draft.nodes as { id: string }[])[0].id).toBe("draft");
  });
});

describe("workflow cron", () => {
  test("parses 5-field cron and finds the next UTC minute", () => {
    expect(parseCron("not-cron")).toBeNull();
    const from = new Date("2026-08-20T09:00:00.000Z");
    expect(cronMatches("0 10 * * *", new Date("2026-08-20T10:00:00.000Z"))).toBe(true);
    expect(nextCronRun("0 10 * * *", from)?.toISOString()).toBe("2026-08-20T10:00:00.000Z");
    expect(nextCronRun("*/15 * * * *", new Date("2026-08-20T10:01:00.000Z"))?.toISOString()).toBe(
      "2026-08-20T10:15:00.000Z"
    );
  });
});

describe("workflow conditions", () => {
  test("supports includes, length, and negation", () => {
    expect(evaluateCondition('includes("err")', "error found")).toEqual({ ok: true, passed: true });
    expect(evaluateCondition("length > 2", "ab")).toEqual({ ok: true, passed: false });
    expect(evaluateCondition('!equals("no")', "yes")).toEqual({ ok: true, passed: true });
    expect(evaluateCondition("explode()", "x").ok).toBe(false);
  });
});

describe("workflow http allowlist", () => {
  test("blocks private hosts and non-https", () => {
    expect(isPrivateHostname("127.0.0.1")).toBe(true);
    expect(isPrivateHostname("10.0.0.8")).toBe(true);
    expect(isPrivateHostname("example.com")).toBe(false);
    expect(assertPublicHttpsUrl("http://example.com").ok).toBe(false);
    expect(assertPublicHttpsUrl("https://127.0.0.1/x").ok).toBe(false);
    expect(assertPublicHttpsUrl("https://example.com/hook").ok).toBe(true);
  });
});
