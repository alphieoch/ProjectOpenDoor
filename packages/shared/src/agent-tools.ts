import type { ToolDefinition } from "./types.js";
import type { AgentRuntimeId } from "./agent-runtimes.js";
import { applyRenderComponent, decideThen } from "./agent-computer.js";
import {
  parseMemoryKind,
  recallWorkspace,
  rememberWithEmbedding,
  formatRecallHits,
  type AgentEmbeddingsClient,
} from "./agent-memory.js";
import { emptyWorkspace, readWorkspace, type AgentWorkspace } from "./agent-workspace.js";
import { runOpenBotComputerTool, type OpenBotToolContext } from "./openbot-runtime.js";

export type { OpenBotToolContext };

export type AgentToolContext = OpenBotToolContext & {
  embeddings?: AgentEmbeddingsClient;
};

export type ToolEvent = { name: string; ok: boolean; detail: string };

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

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function blockedHost(hostname: string) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
  if (h === "::1" || h.startsWith("127.")) return true;
  if (h.startsWith("10.") || h.startsWith("192.168.") || h.startsWith("169.254.")) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;
  return false;
}

async function fetchPublicUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "Only http(s) URLs are allowed.";
  if (blockedHost(parsed.hostname)) return "That host is blocked by the agent sandbox.";
  const res = await fetch(parsed.toString(), {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "OpenDoor-Agent/1.0" },
  });
  const text = (await res.text()).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  return `HTTP ${res.status} ${parsed.host}\n${text.replace(/\s+/g, " ").trim().slice(0, 4000)}`;
}

function sandboxEval(kind: string, input: string): string {
  if (kind === "json") {
    JSON.parse(input);
    return "JSON is valid.";
  }
  if (!/^[0-9+\-*/().\s]+$/.test(input) || input.length > 120) {
    throw new Error("calc only allows numbers and + - * / ( ).");
  }
  const value = Function(`"use strict"; return (${input})`)();
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("calc did not return a finite number.");
  return String(value);
}

function policyAllows(action: string) {
  const a = action.toLowerCase();
  if (/(shell|ssh|exfiltrat|credential|private.?ip|localhost|rm -|sudo)/.test(a)) return false;
  return true;
}

export async function executeTool(
  runtime: AgentRuntimeId,
  name: string,
  rawArgs: string,
  workspace: AgentWorkspace,
  ctx?: AgentToolContext,
): Promise<{ result: string; workspace: AgentWorkspace; event: ToolEvent }> {
  const args = parseArgs(rawArgs);
  let ws = workspace.memory ? { ...emptyWorkspace(), ...workspace, computer: workspace.computer || emptyWorkspace().computer } : emptyWorkspace();
  const now = new Date().toISOString();
  const str = (k: string) => (typeof args[k] === "string" ? String(args[k]).trim() : "");

  const failClosed = (err: unknown) => {
    const failed = err && typeof err === "object" && "openbotFailedWorkspace" in err
      ? (err as { openbotFailedWorkspace: AgentWorkspace }).openbotFailedWorkspace
      : ws;
    const message = err instanceof Error ? err.message : "Tool failed";
    return { result: `ERROR: ${message}`, workspace: failed, event: { name, ok: false, detail: message } };
  };

  try {
    if (name === "remember" || name === "write_memory") {
      const content = str("content");
      if (!content) throw new Error("content is required");
      const kind = parseMemoryKind(str("kind")) || "note";
      const stored = await rememberWithEmbedding({
        id: crypto.randomUUID(),
        kind,
        content: content.slice(0, 2000),
        createdAt: now,
      }, ctx?.embeddings);
      ws.memory.push(stored);
      ws.memory = ws.memory.slice(-80);
      return { result: `Stored ${kind} memory (${ws.memory.length} items).`, workspace: ws, event: { name, ok: true, detail: kind } };
    }

    if (name === "recall" || name === "recall_memory") {
      const recalled = await recallWorkspace(ws, {
        query: str("query"),
        kind: parseMemoryKind(str("kind")),
      }, ctx?.embeddings);
      ws = recalled.workspace;
      return {
        result: recalled.hits.length ? formatRecallHits(recalled.hits) : "No matching memory.",
        workspace: ws,
        event: { name, ok: true, detail: `${recalled.hits.length} hits` },
      };
    }

    if (name === "list_skills") {
      return {
        result: ws.skills.length ? ws.skills.map((s) => `${s.name}: ${s.body}`).join("\n") : "No skills installed.",
        workspace: ws,
        event: { name, ok: true, detail: `${ws.skills.length} skills` },
      };
    }

    if (name === "use_skill") {
      const skill = ws.skills.find((s) => s.name.toLowerCase() === str("name").toLowerCase());
      if (!skill) throw new Error(`Skill "${str("name")}" is not installed.`);
      return {
        result: `Running skill ${skill.name}.\n${skill.body}\nInput: ${str("input") || "(none)"}`,
        workspace: ws,
        event: { name, ok: true, detail: skill.name },
      };
    }

    if (runtime === "openbot" && (name.startsWith("computer_") || name === "request_help" || name === "render_component")) {
      try {
        if (name !== "render_component") {
          return await runOpenBotComputerTool(name, args, ws, ctx);
        }
        if (name === "render_component") {
          const gated = await decideThen(ws, name, { intent: str("title") }, () => applyRenderComponent(ws.computer, str("kind"), str("title"), str("body")));
          if (gated.allowed === false) return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
          ws = { ...gated.workspace, computer: gated.value.computer };
          return {
            result: `Rendered ${gated.value.component.kind} component “${gated.value.component.title}”.`,
            workspace: ws,
            event: { name, ok: true, detail: gated.value.component.kind },
          };
        }
      } catch (err) {
        return failClosed(err);
      }
    }

    if (name === "author_skill") {
      if (runtime !== "hermes" && runtime !== "openbot") throw new Error("author_skill is not available on this runtime.");
      const skillName = str("name").slice(0, 80);
      const body = str("body").slice(0, 4000);
      if (!skillName || !body) throw new Error("name and body are required");
      ws.skills = ws.skills.filter((s) => s.name.toLowerCase() !== skillName.toLowerCase());
      ws.skills.push({ id: crypto.randomUUID(), name: skillName, body, source: "authored", createdAt: now });
      return { result: `Skill "${skillName}" saved.`, workspace: ws, event: { name, ok: true, detail: skillName } };
    }

    if (name === "route_channel") {
      if (runtime !== "openclaw") throw new Error("route_channel is an OpenClaw tool.");
      const item = {
        id: crypto.randomUUID(),
        channel: str("channel") || "web",
        recipient: str("recipient") || "workspace",
        body: str("body").slice(0, 4000),
        createdAt: now,
      };
      if (!item.body) throw new Error("body is required");
      ws.outbox.push(item);
      ws.outbox = ws.outbox.slice(-40);
      return { result: `Queued on ${item.channel} → ${item.recipient}.`, workspace: ws, event: { name, ok: true, detail: item.channel } };
    }

    if (name === "fetch_public_url") {
      if (runtime !== "openclaw") throw new Error("fetch_public_url is an OpenClaw tool.");
      const excerpt = await fetchPublicUrl(str("url"));
      return { result: excerpt, workspace: ws, event: { name, ok: true, detail: str("url") } };
    }

    if (name === "policy_check") {
      if (runtime !== "nemoclaw") throw new Error("policy_check is a NemoClaw tool.");
      const allowed = policyAllows(str("action"));
      ws.audit.push({ id: crypto.randomUUID(), action: str("action"), detail: "policy_check", allowed, createdAt: now });
      ws.audit = ws.audit.slice(-40);
      return {
        result: allowed ? "ALLOWED" : "DENIED by NemoClaw sandbox policy.",
        workspace: ws,
        event: { name, ok: allowed, detail: str("action") },
      };
    }

    if (name === "sandbox_eval") {
      if (runtime !== "nemoclaw") throw new Error("sandbox_eval is a NemoClaw tool.");
      const out = sandboxEval(str("kind") || "calc", str("input"));
      ws.audit.push({ id: crypto.randomUUID(), action: "sandbox_eval", detail: str("kind"), allowed: true, createdAt: now });
      return { result: out, workspace: ws, event: { name, ok: true, detail: str("kind") } };
    }

    if (name === "audit_log") {
      if (runtime !== "nemoclaw") throw new Error("audit_log is a NemoClaw tool.");
      ws.audit.push({
        id: crypto.randomUUID(),
        action: str("action") || "note",
        detail: str("detail").slice(0, 500),
        allowed: true,
        createdAt: now,
      });
      ws.audit = ws.audit.slice(-40);
      return { result: "Logged.", workspace: ws, event: { name, ok: true, detail: str("action") } };
    }

    throw new Error(`Unknown tool ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool failed";
    return { result: `ERROR: ${message}`, workspace: ws, event: { name, ok: false, detail: message } };
  }
}

export function mergeWorkspace(config: unknown, next: AgentWorkspace): AgentWorkspace {
  const prev = readWorkspace(config);
  return { ...prev, ...next, probe: next.probe ?? prev.probe, kind: next.kind ?? prev.kind };
}
