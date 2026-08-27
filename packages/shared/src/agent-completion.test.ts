import { describe, expect, test } from "bun:test";
import { nextAgentCompletionMode } from "./agent-completion.js";

describe("nextAgentCompletionMode", () => {
  test("retries All providers failed once without dropping tools", () => {
    expect(nextAgentCompletionMode("All providers failed", true, false)).toBe("retry-tools");
    expect(nextAgentCompletionMode("Gateway returned 502", true, false)).toBe("retry-tools");
    expect(nextAgentCompletionMode("All providers failed", true, true)).toBe("fail");
  });

  test("only drops tools when the provider truly cannot call them", () => {
    expect(nextAgentCompletionMode("model does not support tools", true, false)).toBe("drop-tools");
    expect(nextAgentCompletionMode("All providers failed", false, false)).toBe("fail");
  });
});
