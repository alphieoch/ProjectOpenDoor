/**
 * Server-only tool execution. Not re-exported from the @opendoor/shared barrel —
 * import from `@opendoor/shared/agent-execute` so Vertex rag-search never loads
 * in the dashboard client.
 */

import type { AgentRuntimeId } from "./agent-runtimes.js";
import { applyRenderComponent, decideThen } from "./agent-computer.js";
import {
  parseMemoryKind,
  recallWorkspace,
  rememberWithEmbedding,
  formatRecallHits,
} from "./agent-memory.js";
import { emptyWorkspace, type AgentWorkspace } from "./agent-workspace.js";
import { runOpenBotComputerTool } from "./openbot-runtime.js";
import { WEB_SEARCH_TOOL_NAME, formatRagSearchDisplay } from "./rag-search-contract.js";
import { ragSearch } from "./rag-search.js";
import type { AgentToolContext, ToolEvent } from "./agent-tools.js";

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
): Promise<{ result: string; display?: string; workspace: AgentWorkspace; event: ToolEvent }> {
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

    if (name === WEB_SEARCH_TOOL_NAME) {
      const query = str("query");
      if (!query) throw new Error("query is required");
      const maxResults = typeof args.max_results === "number" ? args.max_results : undefined;
      if (!ctx?.searchSpend) {
        return {
          result: "ERROR: OpenDoor Search is metered. Enable it on Tools or subscribe to the Web Search add-on.",
          workspace: ws,
          event: { name, ok: false, detail: "search_not_entitled" },
        };
      }
      const gate = await ctx.searchSpend.authorize();
      if (!gate.ok) {
        return {
          result: `ERROR: ${gate.error}`,
          workspace: ws,
          event: { name, ok: false, detail: gate.error },
        };
      }
      try {
        const search = await ragSearch({ query, maxResults });
        if (gate.chargeCents > 0) {
          await ctx.searchSpend.settle(gate.chargeCents);
        }
        const display = formatRagSearchDisplay(search);
        const result = JSON.stringify({
          query: search.query,
          answer: search.answer,
          citations: search.citations,
          provider: search.provider,
          display,
          chargedCents: gate.chargeCents,
        });
        return {
          result,
          display,
          workspace: ws,
          event: { name, ok: true, detail: `${search.citations.length} citations`, display },
        };
      } catch (err) {
        return failClosed(err);
      }
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
