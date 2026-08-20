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
  "web_search",
  "author_skill",
  "computer_navigate",
  "computer_read",
  "computer_screenshot",
  "computer_snapshot",
  "computer_click",
  "computer_move",
  "computer_type",
  "computer_key",
  "computer_scroll",
  "computer_wait",
  "computer_follow_link",
  "computer_list_files",
  "computer_read_file",
  "computer_write_file",
  "computer_request_help",
  "computer_request_secret",
  "request_help",
  "computer_read_page",
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

  test("can author a skill onto the workspace", async () => {
    const written = await executeTool(
      "openbot",
      "author_skill",
      JSON.stringify({ name: "weekly-recap", body: "Write Friday notes under /workspace/drafts/." }),
      emptyWorkspace(),
    );
    expect(written.event.ok).toBe(true);
    expect(written.workspace.skills[0]?.name).toBe("weekly-recap");
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

  test("snapshot lists page links when the live computer is not attached", async () => {
    const opened = await executeTool(
      "openbot",
      "computer_navigate",
      JSON.stringify({ url: "https://example.com", intent: "read the title" }),
      emptyWorkspace(),
    );
    const snap = await executeTool("openbot", "computer_snapshot", "{}", opened.workspace);
    expect(snap.event.ok).toBe(true);
    expect(snap.result).toContain("snapshotId=");
    expect(snap.workspace.computer.snapshotId).toBeGreaterThan(0);
  }, 15000);

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

describe("OpenBot memory recall", () => {
  test("ranks stored notes by query instead of last-N substring", async () => {
    const start = emptyWorkspace();
    start.memory = [
      { id: "old", kind: "semantic", content: "Ada owns billing", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", kind: "note", content: "weather is fine", createdAt: "2026-08-20T00:00:00.000Z" },
    ];
    const recalled = await executeTool("openbot", "recall", JSON.stringify({ query: "billing" }), start);
    expect(recalled.result).toContain("Ada owns billing");
    expect(recalled.result).not.toContain("weather is fine");
  });
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
    const home = readFileSync(
      join(import.meta.dir, "../../app/dashboard/openbot/page.tsx"),
      "utf8",
    );
    const openbotShell = readFileSync(
      join(import.meta.dir, "../../components/openbot/shell.tsx"),
      "utf8",
    );
    const shell = readFileSync(join(import.meta.dir, "../../components/openbot/home.tsx"), "utf8");
    const desk = readFileSync(
      join(import.meta.dir, "../../components/openbot/coworker-workspace.tsx"),
      "utf8",
    );
    const frame = readFileSync(
      join(import.meta.dir, "../../components/dashboard/dashboard-frame.tsx"),
      "utf8",
    );
    const computerApi = readFileSync(
      join(import.meta.dir, "../../app/api/agents/[id]/computer/[...path]/route.ts"),
      "utf8",
    );
    expect(api).toContain("openbot");
    expect(gateway).toContain("openbot");
    expect(gateway).toContain("/:id/chat");
    expect(gateway).toContain("/:id/ag-ui");
    expect(gateway).toContain("computerControl");
    expect(page).toContain("openbot: Monitor");
    expect(page).toContain("item.badge");
    expect(page).toContain("/dashboard/openbot/");
    expect(detail).toContain("/dashboard/openbot/");
    expect(home).toContain("OpenBotHome");
    expect(openbotShell).toContain("OpenBotRail");
    expect(openbotShell).toContain("hostedInDashboard: true");
    expect(shell).toContain("Start a new channel");
    expect(shell).toContain("Explore agents");
    expect(desk).toContain("Take the wheel");
    expect(desk).toContain("ComputerView");
    expect(frame).toContain("DashboardSidebar");
    expect(frame).toContain("MobileBottomNav");
    expect(frame).not.toContain("isOpenBot");
    expect(computerApi).toContain("/screenshot");
    expect(computerApi).toContain("/control/take");
    expect(computerApi).toContain("/attach");
    const computerView = readFileSync(
      join(import.meta.dir, "../../components/openbot/computer-view.tsx"),
      "utf8",
    );
    const liveScreen = readFileSync(
      join(import.meta.dir, "../../components/openbot/live-screen.tsx"),
      "utf8",
    );
    expect(computerView).toContain("z-[100]");
    expect(computerView).toContain("bg-background");
    expect(computerView).toContain("Take the wheel");
    expect(liveScreen).toContain("data-bot-cursor");
    expect(liveScreen).toContain("viewportToOverlay");
    const clickTool = toolsForRuntime("openbot").find((t) => t.function.name === "computer_click");
    expect(clickTool?.function.parameters).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          text: expect.anything(),
          x: expect.anything(),
          y: expect.anything(),
        }),
      }),
    );
    expect(desk).toContain("onComputerReady");
    const engine = readFileSync(join(import.meta.dir, "./engine.ts"), "utf8");
    expect(engine).toContain("nextAgentCompletionMode");
    expect(engine).toContain("toolsForRuntime");
  });
});
