import { describe, expect, test } from "bun:test";
import { OPENBOT_SYSTEM_PROMPT } from "@opendoor/shared";
import {
  collapseConsecutiveDuplicateUserMessages,
  isComputerToolName,
  messagesForModel,
  openBotChatStatusLine,
  turnUsedComputer,
} from "./chat-thread";
import { leaderbotSystemPrompt, withLeaderbotTurnGuidance } from "../openbot-leader";

describe("chat thread pairing", () => {
  test("collapses consecutive identical user messages before they reach the model", () => {
    const history = [
      { role: "user", content: "hi" },
      { role: "user", content: "hi" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello — I lead this house." },
    ];
    expect(messagesForModel(history)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello — I lead this house." },
    ]);
    expect(collapseConsecutiveDuplicateUserMessages(history)).toHaveLength(2);
  });

  test("keeps different user messages and already-paired turns", () => {
    const history = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hey." },
      { role: "user", content: "hi" },
      { role: "user", content: "list coworkers" },
    ];
    expect(messagesForModel(history).map((row) => row.content)).toEqual([
      "hi",
      "Hey.",
      "hi",
      "list coworkers",
    ]);
  });
});

describe("computer working flag", () => {
  test("is only on when a computer tool ran", () => {
    expect(isComputerToolName("list_coworkers")).toBe(false);
    expect(isComputerToolName("spawn_coworker")).toBe(false);
    expect(isComputerToolName("stop_coworker")).toBe(false);
    expect(isComputerToolName("delete_coworker")).toBe(false);
    expect(isComputerToolName("computer_navigate")).toBe(true);
    expect(turnUsedComputer([{ name: "list_coworkers" }])).toBe(false);
    expect(turnUsedComputer([{ name: "computer_read" }])).toBe(true);
    expect(openBotChatStatusLine({ sending: true, usedComputer: false })).toBe("Thinking…");
    expect(openBotChatStatusLine({ sending: true, usedComputer: true })).toBe("Working on its computer…");
    expect(openBotChatStatusLine({ sending: false, usedComputer: true })).toBeNull();
  });
});

describe("Leaderbot greeting prompt", () => {
  test("does not lead with browsing for a hi", () => {
    const prompt = leaderbotSystemPrompt();
    const head = prompt.slice(0, 160).toLowerCase();
    expect(head).toMatch(/house lead|orchestrat/);
    expect(head).not.toMatch(/web browser|browse websites|computer_navigate/);
    expect(prompt.toLowerCase()).toMatch(/greeting|hello|hi/);
    expect(prompt.indexOf("Leaderbot")).toBeLessThan(prompt.indexOf("computer"));

    const stored = `${OPENBOT_SYSTEM_PROMPT} You are Leaderbot.`;
    const guided = withLeaderbotTurnGuidance(stored);
    expect(guided.indexOf("house lead")).toBeLessThan(guided.indexOf("web browser"));
    expect(guided.startsWith("You are a Bot with your own computer")).toBe(false);
  });
});
