import { sanitizeWorkspacePath, type ToolDefinition } from "@opendoor/shared";
import type { AgentRuntimeId } from "@/lib/agents/runtimes";
import {
  applyNavigate,
  applyRenderComponent,
  applyRequestHelp,
  applyWriteFile,
  decideThen,
  fetchComputerPage,
  formatPageSnapshot,
  readWorkspaceFile,
  resolveFollowLink,
} from "@/lib/agents/openbot";
import { emptyWorkspace, readWorkspace, type AgentWorkspace } from "@/lib/agents/state";

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
    fn("recall", "Search this agent's stored memory and return matching notes.", {
      query: { type: "string" },
    }, ["query"]),
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
      fn("computer_navigate", "Open a public http(s) page on this Bot's computer. Decided and audited before the fetch.", {
        url: { type: "string" },
        intent: { type: "string" },
      }, ["url"]),
      fn("computer_read_page", "Read the current page snapshot: title, excerpt, and visible links.", {}, []),
      fn("computer_follow_link", "Follow a link from the current page by matching its text or URL.", {
        query: { type: "string" },
        intent: { type: "string" },
      }, ["query"]),
      fn("computer_list_files", "List files in this Bot's /workspace volume.", {}, []),
      fn("computer_read_file", "Read a file from /workspace.", {
        path: { type: "string" },
      }, ["path"]),
      fn("computer_write_file", "Write a text file under /workspace.", {
        path: { type: "string" },
        content: { type: "string" },
      }, ["path", "content"]),
      fn("request_help", "Ask a person to take the wheel (login, 2FA, or a judgment call).", {
        reason: { type: "string" },
      }, ["reason"]),
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
      const kind = (str("kind") || "note") as AgentWorkspace["memory"][number]["kind"];
      ws.memory.push({ id: crypto.randomUUID(), kind, content: content.slice(0, 2000), createdAt: now });
      ws.memory = ws.memory.slice(-80);
      return { result: `Stored ${kind} memory (${ws.memory.length} items).`, workspace: ws, event: { name, ok: true, detail: kind } };
    }

    if (name === "recall" || name === "recall_memory") {
      const query = str("query").toLowerCase();
      const hits = ws.memory.filter((m) => !query || m.content.toLowerCase().includes(query)).slice(-8);
      return {
        result: hits.length ? hits.map((m) => `[${m.kind}] ${m.content}`).join("\n") : "No matching memory.",
        workspace: ws,
        event: { name, ok: true, detail: `${hits.length} hits` },
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
        if (name === "computer_navigate") {
          const gated = await decideThen(ws, name, { url: str("url"), intent: str("intent") }, () => fetchComputerPage(str("url")));
          if (!gated.allowed) return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
          ws = { ...gated.workspace, computer: applyNavigate(gated.workspace.computer, gated.value) };
          const hint = gated.value.loginWall ? "\nLOGIN_WALL: call request_help if you cannot continue." : "";
          return {
            result: `Opened ${gated.value.url} (HTTP ${gated.value.status}).\n${formatPageSnapshot(ws.computer)}${hint}`,
            workspace: ws,
            event: { name, ok: true, detail: gated.value.host },
          };
        }
        if (name === "computer_follow_link") {
          const href = resolveFollowLink(ws.computer, str("query"));
          if (!href) throw new Error("No matching link on the current page. Navigate first.");
          const gated = await decideThen(ws, name, { url: href, intent: str("intent") || str("query") }, () => fetchComputerPage(href));
          if (!gated.allowed) return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
          ws = { ...gated.workspace, computer: applyNavigate(gated.workspace.computer, gated.value) };
          return {
            result: `Followed ${href}.\n${formatPageSnapshot(ws.computer)}`,
            workspace: ws,
            event: { name, ok: true, detail: gated.value.host },
          };
        }
        if (name === "computer_read_page") {
          const gated = await decideThen(ws, name, {}, () => formatPageSnapshot(ws.computer));
          if (!gated.allowed) return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
          return { result: gated.value, workspace: gated.workspace, event: { name, ok: true, detail: ws.computer.url || "empty" } };
        }
        if (name === "computer_list_files") {
          const gated = await decideThen(ws, name, {}, () => ws.computer.files);
          if (!gated.allowed) return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
          const files = gated.value;
          return {
            result: files.length ? files.map((f) => `${f.path} (${f.content.length} bytes)`).join("\n") : "No files in /workspace.",
            workspace: gated.workspace,
            event: { name, ok: true, detail: `${files.length} files` },
          };
        }
        if (name === "computer_read_file") {
          const gated = await decideThen(ws, name, { path: str("path") }, () => readWorkspaceFile(ws.computer, str("path")));
          if (!gated.allowed) return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
          return { result: `${gated.value.path}\n${gated.value.content}`, workspace: gated.workspace, event: { name, ok: true, detail: gated.value.path } };
        }
        if (name === "computer_write_file") {
          const gated = await decideThen(ws, name, { path: str("path") }, () => applyWriteFile(ws.computer, str("path"), str("content")));
          if (!gated.allowed) return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
          ws = { ...gated.workspace, computer: gated.value };
          return { result: `Wrote ${sanitizeWorkspacePath(str("path")) || str("path")}.`, workspace: ws, event: { name, ok: true, detail: str("path") } };
        }
        if (name === "request_help") {
          const gated = await decideThen(ws, name, { intent: str("reason") }, () => applyRequestHelp(ws.computer, str("reason")));
          if (!gated.allowed) return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
          ws = { ...gated.workspace, computer: gated.value };
          return { result: "Help requested. A person can take the wheel from the computer panel.", workspace: ws, event: { name, ok: true, detail: "help" } };
        }
        if (name === "render_component") {
          const gated = await decideThen(ws, name, { intent: str("title") }, () => applyRenderComponent(ws.computer, str("kind"), str("title"), str("body")));
          if (!gated.allowed) return { result: gated.result, workspace: gated.workspace, event: { name, ok: false, detail: "refused" } };
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
      if (runtime !== "hermes") throw new Error("author_skill is a Hermes tool.");
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
  return { ...prev, ...next, probe: next.probe ?? prev.probe };
}
