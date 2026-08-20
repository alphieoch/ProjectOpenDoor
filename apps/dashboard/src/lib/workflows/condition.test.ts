import { describe, expect, test } from "bun:test";
import { conditionEdgeTaken, evaluateCondition } from "./condition";

describe("workflow condition re-export", () => {
  test("keeps the shared evaluator", () => {
    expect(evaluateCondition('includes("ok")', "this is ok")).toEqual({ ok: true, passed: true });
    expect(conditionEdgeTaken({ sourceHandle: "false" }, true)).toBe(false);
  });
});
