import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_RUNTIME_CATALOG,
  AGENT_RUNTIMES,
  agentRuntimeList,
  getAgentRuntime,
  isAgentRuntime,
} from "./runtimes";
import { emptyWorkspace, readWorkspace, seedSkills, workspacePublic } from "./state";
import { executeTool, toolsForRuntime } from "./tools";
import { applyComputerControl } from "./openbot";

const OPENBOT_TOOLS = [
  "remember",
  "recall",
  "list_skills",
  "use_skill",
  "computer_navigate",
  "computer_read_page",
  "computer_follow_link",
  "computer_list_files",
  "computer_read_file",
  "computer_write_file",
  "request_help",
  "render_component",
];

describe("OpenBot runtime catalog", () => {
  test("is a first-class runtime with a New label", () => {
    expect(AGENT_RUNTIMES).toContain("openbot");
    expect(isAgentRuntime("openbot")).toBe(true);
    expect(isAgentRuntime("unknown")).toBe(false);
    const runtime = getAgentRuntime("openbot");
    expect(runtime?.name).toBe("OpenBot");
    expect(runtime?.maker).toBe("CopilotKit");
    expect(runtime?.badge).toBe("New");
    expect(agentRuntimeList("and")).toContain("OpenBot");
    expect(AGENT_RUNTIME_CATALOG).toHaveLength(4);
  });

  test("exposes the computer tool surface", () => {
    const names = toolsForRuntime("openbot").map((t) => t.function.name);
    expect(names).toEqual(OPENBOT_TOOLS);
    expect(toolsForRuntime("openclaw").map((t) => t.function.name)).not.toContain("computer_navigate");
  });

  test("seeds browse and decide-then-act skills", () => {
    const skills = seedSkills("openbot").map((s) => s.name);
    expect(skills).toContain("browse-and-report");
    expect(skills).toContain("decide-then-act");
    expect(skills).toContain("workspace-files");
  });
});

describe("OpenBot computer tools", () => {
  test("writes, lists, and reads /workspace files through the gateway", async () => {
    const start = emptyWorkspace();
    const written = await executeTool(
      "openbot",
      "computer_write_file",
      JSON.stringify({ path: "notes/brief.md", content: "ship OpenBot" }),
      start,
    );
    expect(written.event.ok).toBe(true);
    expect(written.result).toContain("/workspace/notes/brief.md");
    expect(written.workspace.audit.at(-1)?.outcome).toBe("permitted");

    const listed = await executeTool("openbot", "computer_list_files", "{}", written.workspace);
    expect(listed.result).toContain("/workspace/notes/brief.md");

    const read = await executeTool(
      "openbot",
      "computer_read_file",
      JSON.stringify({ path: "notes/brief.md" }),
      listed.workspace,
    );
    expect(read.event.ok).toBe(true);
    expect(read.result).toContain("ship OpenBot");
  });

  test("refuses file writes outside /workspace", async () => {
    const result = await executeTool(
      "openbot",
      "computer_write_file",
      JSON.stringify({ path: "/etc/passwd", content: "nope" }),
      emptyWorkspace(),
    );
    expect(result.event.ok).toBe(false);
    expect(result.result).toContain("REFUSED");
    expect(result.workspace.audit.at(-1)?.outcome).toBe("refused");
    expect(result.workspace.computer.files).toHaveLength(0);
  });

  test("requests help and renders a component", async () => {
    const help = await executeTool(
      "openbot",
      "request_help",
      JSON.stringify({ reason: "Login wall on the bank site" }),
      emptyWorkspace(),
    );
    expect(help.event.ok).toBe(true);
    expect(help.workspace.computer.status).toBe("help_requested");
    expect(help.workspace.computer.helpReason).toContain("Login wall");

    const card = await executeTool(
      "openbot",
      "render_component",
      JSON.stringify({ kind: "metric", title: "Top story", body: "Example Domain" }),
      help.workspace,
    );
    expect(card.event.ok).toBe(true);
    expect(card.workspace.computer.components[0]?.kind).toBe("metric");
    const pub = workspacePublic(card.workspace);
    expect(pub.computer.components[0]?.title).toBe("Top story");
  });

  test("refuses computer actions after a person takes the wheel", async () => {
    const ws = emptyWorkspace();
    ws.computer = applyComputerControl(ws.computer, "take");
    const result = await executeTool(
      "openbot",
      "computer_write_file",
      JSON.stringify({ path: "notes.md", content: "should not land" }),
      ws,
    );
    expect(result.event.ok).toBe(false);
    expect(result.result).toContain("human_in_control");
    expect(result.workspace.computer.files).toHaveLength(0);
  });

  test("refuses loopback navigation before any fetch", async () => {
    const result = await executeTool(
      "openbot",
      "computer_navigate",
      JSON.stringify({ url: "http://127.0.0.1:4100/admin", intent: "open the computer" }),
      emptyWorkspace(),
    );
    expect(result.event.ok).toBe(false);
    expect(result.result).toContain("REFUSED");
    expect(result.workspace.computer.url).toBeNull();
  });

  test("navigates a public page and stores the snapshot", async () => {
    const result = await executeTool(
      "openbot",
      "computer_navigate",
      JSON.stringify({ url: "https://example.com", intent: "read the title" }),
      emptyWorkspace(),
    );
    expect(result.event.ok).toBe(true);
    expect(result.workspace.computer.url).toContain("example.com");
    expect(result.workspace.computer.title?.length).toBeGreaterThan(0);
    expect(result.workspace.computer.excerpt.toLowerCase()).toContain("example");
    expect(result.workspace.computer.history).toHaveLength(1);
    expect(result.workspace.audit.at(-1)?.outcome).toBe("permitted");

    const page = await executeTool("openbot", "computer_read_page", "{}", result.workspace);
    expect(page.event.ok).toBe(true);
    expect(page.result.toLowerCase()).toContain("example");
  }, 15000);
});

describe("legacy workspace upgrade", () => {
  test("readWorkspace hydrates a computer onto old agent config", () => {
    const ws = readWorkspace({ memory: [], skills: [], outbox: [], audit: [] });
    expect(ws.computer.operator).toBe("bot");
    expect(ws.computer.files).toEqual([]);
    expect(workspacePublic(ws).computer.status).toBe("ready");
  });
});

describe("product wiring", () => {
  test("create API, gateway route, and agents UI accept openbot", () => {
    const root = join(import.meta.dir, "../../../../../");
    const api = readFileSync(join(import.meta.dir, "../../app/api/agents/route.ts"), "utf8");
    const gateway = readFileSync(join(root, "apps/gateway/src/routes/agents.ts"), "utf8");
    const page = readFileSync(join(import.meta.dir, "../../app/dashboard/agents/page.tsx"), "utf8");
    const detail = readFileSync(
      join(import.meta.dir, "../../app/dashboard/agents/[id]/page.tsx"),
      "utf8",
    );
    expect(api).toContain("openbot");
    expect(gateway).toContain("openbot");
    expect(page).toContain("openbot: Monitor");
    expect(page).toContain("item.badge");
    expect(detail).toContain("Take the wheel");
    expect(detail).toContain("computerControl");
  });
});
