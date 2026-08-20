import { describe, expect, test } from "bun:test";
import { asUuid } from "./provider-id.js";
import { getFallbackChain } from "../providers/index.js";
import {
  catalogModelForProvider,
  decideProviderLoop,
  isKeyedProvider,
  vertexOverflowModel,
  vertexToolOverflowModel,
} from "./chat-provider.js";

const emptyEnv = {} as NodeJS.ProcessEnv;
const vertexEnv = { GOOGLE_CLOUD_PROJECT: "demo" } as NodeJS.ProcessEnv;
const togetherEnv = { TOGETHER_API_KEY: "tog_test" } as NodeJS.ProcessEnv;

describe("isKeyedProvider", () => {
  test("together and deepseek are not callable without keys", () => {
    expect(isKeyedProvider("together", { env: emptyEnv })).toBe(false);
    expect(isKeyedProvider("deepseek", { env: emptyEnv })).toBe(false);
    expect(isKeyedProvider("together", { env: togetherEnv })).toBe(true);
    expect(isKeyedProvider("together", { env: emptyEnv, byokSlugs: ["together"] })).toBe(
      true
    );
  });

  test("vertex is callable from GCP project env", () => {
    expect(isKeyedProvider("vertex", { env: emptyEnv })).toBe(false);
    expect(isKeyedProvider("vertex", { env: vertexEnv })).toBe(true);
  });
});

describe("deepseek-v3 overflow", () => {
  test("maps leftover Together id onto Vertex MaaS successor", () => {
    expect(vertexOverflowModel("deepseek-v3")).toBe("deepseek-v3.2");
    expect(catalogModelForProvider("vertex", "deepseek-v3")).toBe("deepseek-v3.2");
    expect(catalogModelForProvider("together", "deepseek-v3")).toBe("deepseek-v3");
    expect(catalogModelForProvider("deepseek", "deepseek-v3")).toBe("deepseek-chat");
    expect(getFallbackChain("deepseek-v3")).toEqual(["together", "vertex", "deepseek"]);
    expect(vertexToolOverflowModel("deepseek-v3.2")).toBe("gemini-2.5-flash");
  });
});

describe("decideProviderLoop", () => {
  test("returns the successful provider response even when request log is skipped", () => {
    expect(asUuid("together")).toBeNull();
    expect(
      decideProviderLoop({
        response: { choices: [{ message: { content: "hello" } }] },
      })
    ).toBe("return");
  });

  test("All providers failed only when tryProvider actually failed", () => {
    expect(decideProviderLoop({ error: new Error("Together 401") })).toBe("continue");
    expect(decideProviderLoop({})).toBe("continue");
    expect(decideProviderLoop({ streamGenerator: {} })).toBe("return");
  });
});
