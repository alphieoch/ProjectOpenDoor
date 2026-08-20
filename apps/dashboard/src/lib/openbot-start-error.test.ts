import { describe, expect, test } from "bun:test";
import { formatAgentStartError } from "./openbot-start-error";

describe("formatAgentStartError", () => {
  test("prefers the server error string and includes the status", () => {
    expect(formatAgentStartError({ error: "Agents add-on required" }, 402)).toBe(
      "Agents add-on required (402)",
    );
  });

  test("reads Next.js message and nested OpenAI-style error bodies", () => {
    expect(formatAgentStartError({ message: 'column "deleted_at" does not exist' }, 500)).toBe(
      'column "deleted_at" does not exist (500)',
    );
    expect(formatAgentStartError({ error: { message: "Insufficient balance" } }, 402)).toBe(
      "Insufficient balance (402)",
    );
  });

  test("falls back to the generic copy with status when the body is empty", () => {
    expect(formatAgentStartError({}, 500)).toBe("Could not start that coworker (500)");
    expect(formatAgentStartError(null, 0)).toBe("Could not start that coworker");
  });
});
