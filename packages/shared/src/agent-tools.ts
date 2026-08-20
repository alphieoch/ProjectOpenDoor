/** Tool schemas and types. Execution (Vertex search) lives in agent-execute.ts. */

import type { ToolDefinition } from "./types.js";
import type { AgentRuntimeId } from "./agent-runtimes.js";
import type { AgentEmbeddingsClient } from "./agent-memory.js";
import { readWorkspace, type AgentWorkspace } from "./agent-workspace.js";
import type { OpenBotToolContext } from "./openbot-runtime.js";
import { WEB_SEARCH_TOOL_NAME } from "./rag-search-contract.js";

export type { OpenBotToolContext };

export type SearchSpendGate = {
  authorize: () => Promise<{ ok: true; chargeCents: number } | { ok: false; error: string }>;
  settle: (chargeCents: number) => Promise<void>;
};

export type AgentToolContext = OpenBotToolContext & {
  embeddings?: AgentEmbeddingsClient;
  searchSpend?: SearchSpendGate;
};

export type ToolEvent = { name: string; ok: boolean; detail: string; display?: string };

function fn(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

export function toolsForRuntime(runtime: AgentRuntimeId): ToolDefinition[] {
  const shared = [
    fn("remember", "Store a durable note in this agent's workspace memory.", {
      content: { type: "string" },
      kind: { type: "string", enum: ["working", "episodic", "semantic", "note"] },
    }, ["content"]),
    fn("recall", "Search this agent's stored memory by query, kind, and recency. Omit query for the newest notes.", {
      query: { type: "string" },
      kind: { type: "string", enum: ["working", "episodic", "semantic", "note"] },
    }, []),
    fn("list_skills", "List skills installed on this agent.", {}, []),
    fn("use_skill", "Run a named skill and return its instructions plus the input.", {
      name: { type: "string" },
      input: { type: "string" },
    }, ["name"]),
    fn(
      WEB_SEARCH_TOOL_NAME,
      "OpenDoor Search: look up a fact on the live web. Returns a short synthesized answer and 2–5 citations from Vertex grounding on OpenDoor's GCP. Use this for ages, dates, lineups, and other factual questions. Do not invent URLs. Do not open Google in the browser to answer a fact. Use computer_navigate only when they asked you to browse or open a specific page.",
      {
        query: { type: "string", description: "Factual search query" },
        max_results: { type: "number", description: "Citation cap, 2–5" },
      },
      ["query"],
    ),
  ];

  if (runtime === "hermes") {
    return [
      ...shared,
      fn("write_memory", "Write a Hermes memory item (working, episodic, or semantic).", {
        content: { type: "string" },
        kind: { type: "string", enum: ["working", "episodic", "semantic"] },
      }, ["content", "kind"]),
      fn("author_skill", "Save a reusable skill the agent learned from this session.", {
        name: { type: "string" },
        body: { type: "string" },
      }, ["name", "body"]),
    ];
  }

  if (runtime === "openbot") {
    return [
      ...shared,
      fn("author_skill", "Save a reusable skill this OpenBot coworker should follow on later turns.", {
        name: { type: "string" },
        body: { type: "string" },
      }, ["name", "body"]),
      fn("computer_navigate", "Open a public http(s) page on this Bot's computer. Decided and audited before it runs.", {
        url: { type: "string" },
        intent: { type: "string" },
      }, ["url"]),
      fn("computer_read", "Read the current page as text without navigating.", {}, []),
      fn("computer_screenshot", "Capture the Chromium viewport as a PNG. width/height are CSS pixels — the same coordinate space as computer_click x,y and the live cursor. Call this after every click so you can see the result.", {}, []),
      fn("computer_snapshot", "List interactive elements with refs. Use before click/type when the page exposes buttons in the accessibility tree.", {}, []),
      fn("computer_click", "Click on the live Chromium page. Prefer text for labeled buttons (cookie consent: “Reject all” / “Accept all”). Use a snapshot ref when you have one. Use x,y in computer_screenshot CSS pixels as fallback. The live cursor moves to the target first.", {
        text: { type: "string", description: "Visible button or link text, e.g. Accept all" },
        selector: { type: "string", description: "CSS selector, including inside same-origin frames" },
        ref: { type: "string", description: "Ref from the last computer_snapshot" },
        snapshotId: { type: "number" },
        x: { type: "number", description: "Screenshot / viewport CSS pixel X" },
        y: { type: "number", description: "Screenshot / viewport CSS pixel Y" },
      }, []),
      fn("computer_move", "Move the visible bot cursor to screenshot-space x,y without clicking. Same coordinates as computer_screenshot.", {
        x: { type: "number" },
        y: { type: "number" },
      }, ["x", "y"]),
      fn("computer_type", "Type into a snapshot ref, or into whatever currently has focus if ref is omitted. Optionally submit with Enter.", {
        ref: { type: "string" },
        snapshotId: { type: "number" },
        text: { type: "string" },
        submit: { type: "boolean" },
      }, ["text"]),
      fn("computer_key", "Press a key such as Enter or Tab.", {
        key: { type: "string" },
        ref: { type: "string" },
        snapshotId: { type: "number" },
      }, ["key"]),
      fn("computer_scroll", "Scroll the page.", {
        deltaY: { type: "number" },
      }, []),
      fn("computer_wait", "Wait for the page to settle after a click or navigation, then you can screenshot again.", {
        ms: { type: "number", description: "Milliseconds to wait, default 800, max 15000" },
      }, []),
      fn("computer_follow_link", "Follow a visible link or control by matching its text.", {
        query: { type: "string" },
        intent: { type: "string" },
      }, ["query"]),
      fn("computer_list_files", "List files in this Bot's /workspace volume.", {}, []),
      fn("computer_read_file", "Read a file from /workspace. Paths are relative, such as notes.md.", {
        path: { type: "string" },
      }, ["path"]),
      fn("computer_write_file", "Write a text file under /workspace.", {
        path: { type: "string" },
        content: { type: "string" },
      }, ["path", "content"]),
      fn("computer_request_help", "Ask a person to take the wheel (login, 2FA, or a judgment call).", {
        reason: { type: "string" },
      }, ["reason"]),
      fn("computer_request_secret", "Ask a person for one secret value into a snapshot ref. You never see it.", {
        label: { type: "string" },
        ref: { type: "string" },
        snapshotId: { type: "number" },
      }, ["label", "ref", "snapshotId"]),
      fn("request_help", "Alias for computer_request_help.", {
        reason: { type: "string" },
      }, ["reason"]),
      fn("computer_read_page", "Alias for computer_read.", {}, []),
      fn("render_component", "Answer with a governed UI card instead of only prose.", {
        kind: { type: "string", enum: ["metric", "list", "table", "links", "note"] },
        title: { type: "string" },
        body: { type: "string" },
      }, ["kind", "title", "body"]),
    ];
  }

  if (runtime === "nemoclaw") {
    return [
      ...shared,
      fn("policy_check", "Ask the NemoClaw sandbox whether an action is allowed.", {
        action: { type: "string" },
      }, ["action"]),
      fn("sandbox_eval", "Run a locked-down calc or JSON parse. No shell, no network.", {
        kind: { type: "string", enum: ["calc", "json"] },
        input: { type: "string" },
      }, ["kind", "input"]),
      fn("audit_log", "Record an attributable action on this workspace.", {
        action: { type: "string" },
        detail: { type: "string" },
      }, ["action"]),
    ];
  }

  return [
    ...shared,
    fn("route_channel", "Queue an outbound message on a channel this OpenClaw agent owns.", {
      channel: { type: "string", enum: ["web", "slack", "discord", "telegram", "whatsapp"] },
      recipient: { type: "string" },
      body: { type: "string" },
    }, ["channel", "body"]),
    fn("fetch_public_url", "GET a public https URL and return a short text excerpt.", {
      url: { type: "string" },
    }, ["url"]),
  ];
}

export function mergeWorkspace(config: unknown, next: AgentWorkspace): AgentWorkspace {
  const prev = readWorkspace(config);
  return { ...prev, ...next, probe: next.probe ?? prev.probe, kind: next.kind ?? prev.kind };
}
