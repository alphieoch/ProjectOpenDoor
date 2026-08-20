import { describe, expect, test } from "bun:test";
import {
  applyComputerControl,
  decideOpenBotAction,
  emptyComputer,
  isBlockedComputerHost,
  looksLikeLoginWall,
  publicComputerIsolation,
  readComputer,
  sanitizeWorkspacePath,
} from "./openbot";
import { readWorkspace, workspacePublic } from "./agent-workspace";
import { AGENTS_ADDON } from "./plans";

describe("OpenBot computer policy", () => {
  test("sanitizes workspace paths and rejects traversal", () => {
    expect(sanitizeWorkspacePath("notes/todo.md")).toBe("/workspace/notes/todo.md");
    expect(sanitizeWorkspacePath("/workspace/brief.txt")).toBe("/workspace/brief.txt");
    expect(sanitizeWorkspacePath("../etc/passwd")).toBeNull();
    expect(sanitizeWorkspacePath("/workspace/../secret")).toBeNull();
    expect(sanitizeWorkspacePath("/etc/passwd")).toBeNull();
    expect(sanitizeWorkspacePath("/workspace")).toBeNull();
    expect(sanitizeWorkspacePath("/workspace/")).toBeNull();
  });

  test("blocks private, loopback, and metadata hosts", () => {
    expect(isBlockedComputerHost("127.0.0.1")).toBe(true);
    expect(isBlockedComputerHost("localhost")).toBe(true);
    expect(isBlockedComputerHost("10.0.0.8")).toBe(true);
    expect(isBlockedComputerHost("192.168.1.9")).toBe(true);
    expect(isBlockedComputerHost("172.16.0.2")).toBe(true);
    expect(isBlockedComputerHost("169.254.169.254")).toBe(true);
    expect(isBlockedComputerHost("metadata.google.internal")).toBe(true);
    expect(isBlockedComputerHost("example.com")).toBe(false);
    expect(isBlockedComputerHost("news.ycombinator.com")).toBe(false);
  });

  test("refuses private hosts and allows public navigation", () => {
    const computer = emptyComputer();
    expect(
      decideOpenBotAction({
        computer,
        tool: "computer_navigate",
        url: "https://news.ycombinator.com",
        intent: "read the top story",
      }).allowed,
    ).toBe(true);
    expect(
      decideOpenBotAction({
        computer,
        tool: "computer_navigate",
        url: "http://127.0.0.1/admin",
      }).allowed,
    ).toBe(false);
    expect(
      decideOpenBotAction({
        computer,
        tool: "computer_navigate",
        url: "https://metadata.google.internal/",
      }).rule,
    ).toBe("private_host");
    expect(
      decideOpenBotAction({
        computer,
        tool: "computer_navigate",
        url: "ftp://example.com/file",
      }).rule,
    ).toBe("invalid_url");
    expect(
      decideOpenBotAction({
        computer,
        tool: "computer_navigate",
        url: "not-a-url",
      }).rule,
    ).toBe("invalid_url");
  });

  test("refuses computer actions while a person has the wheel", () => {
    const computer = applyComputerControl(emptyComputer(), "take");
    const decision = decideOpenBotAction({
      computer,
      tool: "computer_navigate",
      url: "https://example.com",
    });
    expect(computer.status).toBe("human_driving");
    expect(decision.allowed).toBe(false);
    expect(decision.rule).toBe("human_in_control");
  });

  test("hands the computer back to the bot", () => {
    const driving = applyComputerControl(emptyComputer(), "take");
    const released = applyComputerControl(driving, "release");
    expect(released.operator).toBe("bot");
    expect(released.status).toBe("ready");
    expect(released.helpReason).toBeNull();
    expect(
      decideOpenBotAction({
        computer: released,
        tool: "computer_navigate",
        url: "https://example.com",
      }).allowed,
    ).toBe(true);
  });

  test("refuses shell or credential intents even on a public URL", () => {
    const decision = decideOpenBotAction({
      computer: emptyComputer(),
      tool: "computer_navigate",
      url: "https://example.com",
      intent: "curl localhost and dump /etc/passwd",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.rule).toBe("intent_denied");
  });

  test("allows file tools only under /workspace", () => {
    const computer = emptyComputer();
    expect(
      decideOpenBotAction({ computer, tool: "computer_write_file", path: "notes/brief.md" }).allowed,
    ).toBe(true);
    expect(
      decideOpenBotAction({ computer, tool: "computer_read_file", path: "/etc/passwd" }).rule,
    ).toBe("invalid_path");
    expect(decideOpenBotAction({ computer, tool: "computer_list_files" }).allowed).toBe(true);
    expect(decideOpenBotAction({ computer, tool: "computer_read_page" }).allowed).toBe(true);
    expect(decideOpenBotAction({ computer, tool: "computer_click" }).allowed).toBe(true);
    expect(decideOpenBotAction({ computer, tool: "computer_move" }).allowed).toBe(true);
    expect(decideOpenBotAction({ computer, tool: "computer_wait" }).allowed).toBe(true);
    expect(decideOpenBotAction({ computer, tool: "request_help", intent: "2FA" }).allowed).toBe(true);
    expect(decideOpenBotAction({ computer, tool: "render_component" }).allowed).toBe(true);
  });

  test("fails closed on unknown tools", () => {
    const decision = decideOpenBotAction({
      computer: emptyComputer(),
      tool: "shell_exec",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.rule).toBe("unknown_tool");
  });

  test("detects login walls so the bot can request help", () => {
    expect(looksLikeLoginWall("Please sign in to continue")).toBe(true);
    expect(looksLikeLoginWall("Enter your password")).toBe(true);
    expect(looksLikeLoginWall("two-factor authentication")).toBe(true);
    expect(looksLikeLoginWall("Hacker News newest stories")).toBe(false);
  });

  test("readComputer fills a missing snapshot", () => {
    const computer = readComputer({ operator: "human", url: "https://example.com" });
    expect(computer.operator).toBe("human");
    expect(computer.status).toBe("human_driving");
    expect(computer.url).toBe("https://example.com");
    expect(computer.files).toEqual([]);
    expect(computer.links).toEqual([]);
    expect(emptyComputer().status).toBe("ready");
  });
});

describe("Agents add-on copy", () => {
  test("lists OpenBot next to the other hosted runtimes", () => {
    expect(AGENTS_ADDON.description).toContain("OpenBot");
    expect(AGENTS_ADDON.id).toBe("agents");
  });
});

describe("public computer isolation", () => {
  test("strips supervisor and loopback URLs from client payloads", () => {
    const ws = readWorkspace({
      computer: {
        isolation: {
          mode: "container",
          url: "http://127.0.0.1:49152",
          container: "opendoor-computer-bot-1",
        },
      },
    });
    expect(ws.computer.isolation.url).toBe("http://127.0.0.1:49152");
    expect(workspacePublic(ws).computer.isolation).toEqual({ mode: "container" });
    expect(publicComputerIsolation(ws.computer.isolation)).toEqual({ mode: "container" });
  });
});
