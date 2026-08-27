import { describe, expect, test } from "bun:test";
import {
  geminiContentsFromMessages,
  geminiFunctionDeclarations,
  geminiPartsToMessage,
  vertexToolOverflowModel,
} from "./vertex-tools.js";

describe("vertexToolOverflowModel", () => {
  test("overflows DeepSeek MaaS onto Gemini when tools are required", () => {
    expect(vertexToolOverflowModel("deepseek-v3")).toBe("gemini-2.5-flash");
    expect(vertexToolOverflowModel("deepseek-v3.2")).toBe("gemini-2.5-flash");
    expect(vertexToolOverflowModel("gemini-2.5-flash")).toBeNull();
  });
});

describe("gemini function calling", () => {
  test("maps OpenAI tools and a tool-result turn", () => {
    const declarations = geminiFunctionDeclarations([
      {
        type: "function",
        function: {
          name: "computer_click",
          description: "Click",
          parameters: { type: "object", properties: { text: { type: "string" } } },
        },
      },
    ]);
    expect(declarations?.[0]?.name).toBe("computer_click");

    const packed = geminiContentsFromMessages([
      { role: "system", content: "You have a computer." },
      { role: "user", content: "Accept the cookies" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "computer_click", arguments: "{\"text\":\"Accept all\"}" },
          },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "Clicked Accept all → https://google.com" },
    ]);
    expect(packed.system).toContain("computer");
    expect(packed.contents[1]?.role).toBe("model");
    expect(JSON.stringify(packed.contents[1])).toContain("computer_click");
    expect(JSON.stringify(packed.contents[2])).toContain("functionResponse");
  });

  test("reads a Gemini functionCall back into OpenAI tool_calls", () => {
    const parsed = geminiPartsToMessage([
      { functionCall: { name: "computer_click", args: { text: "Accept all" } } },
    ]);
    expect(parsed.finish_reason).toBe("tool_calls");
    expect(parsed.tool_calls[0]?.function.name).toBe("computer_click");
    expect(parsed.tool_calls[0]?.function.arguments).toContain("Accept all");
  });
});
