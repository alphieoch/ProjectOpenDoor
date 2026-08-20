import {
  applyComputerControl,
  decideOpenBotAction,
  emptyComputer,
  looksLikeLoginWall,
  readComputer,
  sanitizeWorkspacePath,
  type AgentComputer,
  type ComputerComponent,
  type ComputerControl,
  type ComputerFile,
  type ComputerLink,
  type OpenBotAuditOutcome,
  type OpenBotComponentKind,
} from "./openbot.js";
import type { AgentAuditItem, AgentWorkspace } from "./agent-workspace.js";

export {
  applyComputerControl,
  emptyComputer,
  readComputer,
  type AgentComputer,
  type ComputerControl,
};

const MAX_FILES = 24;
const MAX_FILE_BYTES = 20_000;
const MAX_HISTORY = 20;
const MAX_COMPONENTS = 12;
const MAX_LINKS = 30;

function nowIso() {
  return new Date().toISOString();
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractTitle(html: string, fallbackHost: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? stripTags(match[1]) : "";
  return title.slice(0, 180) || fallbackHost;
}

function extractLinks(html: string, pageUrl: string): ComputerLink[] {
  const links: ComputerLink[] = [];
  const seen = new Set<string>();
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && links.length < MAX_LINKS) {
    try {
      const href = new URL(match[1], pageUrl).toString();
      if (!href.startsWith("http")) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const text = stripTags(match[2]).slice(0, 160) || href;
      links.push({ text, href });
    } catch {
      /* skip */
    }
  }
  return links;
}

export function recordOpenBotAudit(
  workspace: AgentWorkspace,
  opts: {
    action: string;
    detail: string;
    allowed: boolean;
    rule?: string;
    outcome: OpenBotAuditOutcome;
  },
): AgentWorkspace {
  const item: AgentAuditItem = {
    id: crypto.randomUUID(),
    action: opts.action,
    detail: opts.detail.slice(0, 500),
    allowed: opts.allowed,
    createdAt: nowIso(),
    rule: opts.rule,
    outcome: opts.outcome,
  };
  return { ...workspace, audit: [...workspace.audit, item].slice(-40) };
}

export async function fetchComputerPage(url: string): Promise<{
  url: string;
  host: string;
  status: number;
  title: string;
  excerpt: string;
  links: ComputerLink[];
  loginWall: boolean;
}> {
  const parsed = new URL(url);
  const res = await fetch(parsed.toString(), {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "OpenDoor-OpenBot/1.0" },
  });
  const html = await res.text();
  const excerpt = stripTags(html).slice(0, 4000);
  const title = extractTitle(html, parsed.host);
  const finalUrl = res.url || parsed.toString();
  return {
    url: finalUrl,
    host: parsed.host,
    status: res.status,
    title,
    excerpt,
    links: extractLinks(html, finalUrl),
    loginWall: looksLikeLoginWall(`${title} ${excerpt}`),
  };
}

export function applyNavigate(computer: AgentComputer, page: Awaited<ReturnType<typeof fetchComputerPage>>): AgentComputer {
  return {
    ...computer,
    url: page.url,
    title: page.title,
    excerpt: page.excerpt,
    links: page.links,
    history: [
      ...computer.history,
      {
        id: crypto.randomUUID(),
        url: page.url,
        title: page.title,
        status: page.status,
        createdAt: nowIso(),
      },
    ].slice(-MAX_HISTORY),
  };
}

export function resolveFollowLink(computer: AgentComputer, query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return computer.links[0]?.href || null;
  const hit = computer.links.find(
    (link) => link.text.toLowerCase().includes(q) || link.href.toLowerCase().includes(q),
  );
  return hit?.href || null;
}

export function applyWriteFile(computer: AgentComputer, path: string, content: string): AgentComputer {
  const safe = sanitizeWorkspacePath(path);
  if (!safe) throw new Error("Invalid workspace path.");
  const body = content.slice(0, MAX_FILE_BYTES);
  const next = computer.files.filter((f) => f.path !== safe);
  next.push({ path: safe, content: body, updatedAt: nowIso() });
  return { ...computer, files: next.slice(-MAX_FILES) };
}

export function readWorkspaceFile(computer: AgentComputer, path: string): ComputerFile {
  const safe = sanitizeWorkspacePath(path);
  if (!safe) throw new Error("Invalid workspace path.");
  const file = computer.files.find((f) => f.path === safe);
  if (!file) throw new Error(`No file at ${safe}.`);
  return file;
}

export function applyRequestHelp(computer: AgentComputer, reason: string): AgentComputer {
  return {
    ...computer,
    status: computer.operator === "human" ? "human_driving" : "help_requested",
    helpReason: reason.slice(0, 400) || "The bot asked a person to take the wheel.",
  };
}

export function applyRenderComponent(
  computer: AgentComputer,
  kind: string,
  title: string,
  body: string,
): { computer: AgentComputer; component: ComputerComponent } {
  const allowed: OpenBotComponentKind[] = ["metric", "list", "table", "links", "note"];
  const resolved = allowed.includes(kind as OpenBotComponentKind) ? (kind as OpenBotComponentKind) : "note";
  const component: ComputerComponent = {
    id: crypto.randomUUID(),
    kind: resolved,
    title: (title || "OpenBot").slice(0, 120),
    body: body.slice(0, 4000),
    createdAt: nowIso(),
  };
  return {
    component,
    computer: {
      ...computer,
      components: [...computer.components, component].slice(-MAX_COMPONENTS),
    },
  };
}

export function decideThen<T>(
  workspace: AgentWorkspace,
  tool: string,
  subject: { url?: string; path?: string; intent?: string },
  run: () => Promise<T> | T,
): Promise<{ allowed: false; workspace: AgentWorkspace; result: string } | { allowed: true; workspace: AgentWorkspace; value: T }> {
  const computer = readComputer(workspace.computer);
  const decision = decideOpenBotAction({ computer, tool, ...subject });
  if (!decision.allowed) {
    const next = recordOpenBotAudit(workspace, {
      action: tool,
      detail: decision.reason,
      allowed: false,
      rule: decision.rule,
      outcome: "refused",
    });
    return Promise.resolve({
      allowed: false as const,
      workspace: next,
      result: `REFUSED by OpenBot gateway (${decision.rule}): ${decision.reason}`,
    });
  }
  return Promise.resolve()
    .then(() => run())
    .then((value) => ({
      allowed: true as const,
      workspace: recordOpenBotAudit(workspace, {
        action: tool,
        detail: decision.reason,
        allowed: true,
        rule: decision.rule,
        outcome: "permitted",
      }),
      value,
    }))
    .catch((err) => {
      const message = err instanceof Error ? err.message : "Computer action failed";
      throw Object.assign(new Error(message), {
        openbotFailedWorkspace: recordOpenBotAudit(workspace, {
          action: tool,
          detail: message,
          allowed: true,
          rule: decision.rule,
          outcome: "failed",
        }),
      });
    });
}

export function formatPageSnapshot(computer: AgentComputer) {
  if (!computer.url) return "No page is loaded on this computer.";
  const links = computer.links
    .slice(0, 8)
    .map((l) => `- ${l.text} → ${l.href}`)
    .join("\n");
  return [
    `${computer.title || computer.url} (${computer.url})`,
    computer.excerpt || "(empty excerpt)",
    links ? `Links:\n${links}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
