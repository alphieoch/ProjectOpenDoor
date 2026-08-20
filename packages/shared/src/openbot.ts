export const OPENBOT_RUNTIME_ID = "openbot" as const;

export type ComputerOperator = "bot" | "human";
export type ComputerStatus = "ready" | "help_requested" | "human_driving";
export type ComputerControl = "take" | "release";
export type OpenBotComponentKind = "metric" | "list" | "table" | "links" | "note";
export type OpenBotAuditOutcome = "permitted" | "refused" | "failed";

export type ComputerFile = {
  path: string;
  content: string;
  updatedAt: string;
  embedding?: number[];
  embeddingModel?: string;
  embeddingAt?: string;
};

export type ComputerHistoryItem = {
  id: string;
  url: string;
  title: string;
  status: number;
  createdAt: string;
};

export type ComputerLink = {
  text: string;
  href: string;
};

export type ComputerComponent = {
  id: string;
  kind: OpenBotComponentKind;
  title: string;
  body: string;
  createdAt: string;
};

export type ComputerSnapshotElement = {
  ref: string;
  role: string;
  name: string;
  value?: string;
  type?: string;
  disabled?: boolean;
  checked?: boolean;
};

export type ComputerIsolation = {
  mode: "container" | "shared" | "in-process";
  url?: string | null;
  container?: string | null;
  runtime?: string | null;
};

export type AgentComputer = {
  operator: ComputerOperator;
  status: ComputerStatus;
  helpReason: string | null;
  url: string | null;
  title: string | null;
  excerpt: string;
  links: ComputerLink[];
  history: ComputerHistoryItem[];
  files: ComputerFile[];
  components: ComputerComponent[];
  snapshotId: number | null;
  elements: ComputerSnapshotElement[];
  backend: "live" | "fetch";
  isolation: ComputerIsolation;
};

export type OpenBotDecision = {
  allowed: boolean;
  rule: string;
  reason: string;
};

const COMPUTER_TOOLS = new Set([
  "computer_navigate",
  "computer_read",
  "computer_read_page",
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
  "render_component",
]);

export function emptyComputer(): AgentComputer {
  return {
    operator: "bot",
    status: "ready",
    helpReason: null,
    url: null,
    title: null,
    excerpt: "",
    links: [],
    history: [],
    files: [],
    components: [],
    snapshotId: null,
    elements: [],
    backend: "fetch",
    isolation: { mode: "in-process", url: null, container: null, runtime: null },
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readComputerFile(raw: unknown): ComputerFile {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const embedding = Array.isArray(src.embedding)
    && src.embedding.length > 0
    && src.embedding.length <= 4096
    && src.embedding.every((n) => typeof n === "number" && Number.isFinite(n))
    ? (src.embedding as number[])
    : undefined;
  return {
    path: asString(src.path),
    content: asString(src.content),
    updatedAt: asString(src.updatedAt),
    ...(embedding
      ? {
        embedding,
        embeddingModel: typeof src.embeddingModel === "string" ? src.embeddingModel : undefined,
        embeddingAt: typeof src.embeddingAt === "string" ? src.embeddingAt : undefined,
      }
      : {}),
  };
}

export function readComputer(raw: unknown): AgentComputer {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const operator = src.operator === "human" ? "human" : "bot";
  const status =
    src.status === "help_requested" || src.status === "human_driving" || src.status === "ready"
      ? src.status
      : operator === "human"
        ? "human_driving"
        : "ready";
  return {
    operator,
    status,
    helpReason: asString(src.helpReason) || null,
    url: asString(src.url) || null,
    title: asString(src.title) || null,
    excerpt: asString(src.excerpt),
    links: Array.isArray(src.links) ? (src.links as ComputerLink[]) : [],
    history: Array.isArray(src.history) ? (src.history as ComputerHistoryItem[]) : [],
    files: Array.isArray(src.files) ? src.files.map(readComputerFile) : [],
    components: Array.isArray(src.components) ? (src.components as ComputerComponent[]) : [],
    snapshotId: typeof src.snapshotId === "number" ? src.snapshotId : null,
    elements: Array.isArray(src.elements) ? (src.elements as ComputerSnapshotElement[]) : [],
    backend: src.backend === "live" ? "live" : "fetch",
    isolation: readIsolation(src.isolation),
  };
}

function readIsolation(raw: unknown): ComputerIsolation {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode =
    src.mode === "container" || src.mode === "shared" || src.mode === "in-process" ? src.mode : "in-process";
  return {
    mode,
    url: typeof src.url === "string" ? src.url : null,
    container: typeof src.container === "string" ? src.container : null,
    runtime: typeof src.runtime === "string" ? src.runtime : null,
  };
}

export function toRelWorkspacePath(path: string): string | null {
  const safe = sanitizeWorkspacePath(path);
  if (!safe) return null;
  return safe.replace(/^\/workspace\//, "");
}

export function isBlockedComputerHost(hostname: string) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
  if (h === "::1" || h.startsWith("127.")) return true;
  if (h.startsWith("10.") || h.startsWith("192.168.") || h.startsWith("169.254.")) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;
  return false;
}

export function sanitizeWorkspacePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("/workspace")) return null;
  const withRoot = trimmed.startsWith("/workspace") ? trimmed : `/workspace/${trimmed.replace(/^\/+/, "")}`;
  if (withRoot.includes("\0") || withRoot.includes("..")) return null;
  if (!/^\/workspace\/[A-Za-z0-9._/-]{1,120}$/.test(withRoot)) return null;
  if (withRoot === "/workspace" || withRoot.endsWith("/")) return null;
  return withRoot;
}

export function looksLikeLoginWall(text: string) {
  return /(sign[\s-]?in|log[\s-]?in|password|two[\s-]?factor|2fa|one[\s-]?time code|captcha|verify (your )?identity)/i.test(
    text,
  );
}

function deny(rule: string, reason: string): OpenBotDecision {
  return { allowed: false, rule, reason };
}

function allow(rule: string, reason: string): OpenBotDecision {
  return { allowed: true, rule, reason };
}

export function decideOpenBotAction(opts: {
  computer: AgentComputer;
  tool: string;
  url?: string;
  path?: string;
  intent?: string;
}): OpenBotDecision {
  const tool = opts.tool.trim();
  if (!COMPUTER_TOOLS.has(tool)) {
    return deny("unknown_tool", "OpenBot refuses tools that are not on the computer gateway.");
  }

  const intent = (opts.intent || "").toLowerCase();
  if (/(shell|ssh|exfiltrat|credential|private.?ip|localhost|rm -|sudo|\/etc\/passwd)/.test(intent)) {
    return deny("intent_denied", "That intent is blocked by the OpenBot computer policy.");
  }

  if (opts.computer.operator === "human" && tool !== "request_help") {
    return deny("human_in_control", "A person has the wheel. Bot computer actions are refused.");
  }

  if (tool === "computer_navigate" || tool === "computer_follow_link") {
    if (tool === "computer_follow_link" && !opts.url) {
      return allow("follow_link", "Resolve a link from the current page snapshot.");
    }
    let parsed: URL;
    try {
      parsed = new URL(opts.url || "");
    } catch {
      return deny("invalid_url", "Only absolute http(s) URLs can be opened.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return deny("invalid_url", "Only http(s) URLs can be opened.");
    }
    if (isBlockedComputerHost(parsed.hostname)) {
      return deny("private_host", "Private, loopback, and cloud-metadata hosts are refused.");
    }
    return allow("navigate_public", `Open ${parsed.host}.`);
  }

  if (tool === "computer_read_file" || tool === "computer_write_file") {
    const path = sanitizeWorkspacePath(opts.path || "");
    if (!path) return deny("invalid_path", "Files must live under /workspace with a safe path.");
    return allow("workspace_file", `${tool === "computer_write_file" ? "Write" : "Read"} ${path}.`);
  }

  if (
    tool === "computer_list_files" ||
    tool === "computer_read_page" ||
    tool === "computer_read" ||
    tool === "computer_screenshot" ||
    tool === "computer_snapshot" ||
    tool === "computer_wait"
  ) {
    return allow("inspect", "Read the current computer snapshot.");
  }

  if (
    tool === "computer_click" ||
    tool === "computer_move" ||
    tool === "computer_type" ||
    tool === "computer_key" ||
    tool === "computer_scroll"
  ) {
    return allow("act", "Act on the current page (text, selector, ref, or screenshot x,y).");
  }

  if (tool === "computer_request_secret") {
    return allow("secret", "Ask a person for one value; the Bot never sees it.");
  }

  if (tool === "request_help" || tool === "computer_request_help") {
    return allow("help", "Ask a person to take the wheel.");
  }

  if (tool === "render_component") {
    return allow("component", "Publish a governed UI component instead of prose.");
  }

  return deny("fail_closed", "A missing computer policy permits nothing.");
}

export function applyComputerControl(computer: AgentComputer, control: ComputerControl): AgentComputer {
  if (control === "take") {
    return {
      ...computer,
      operator: "human",
      status: "human_driving",
    };
  }
  return {
    ...computer,
    operator: "bot",
    status: "ready",
    helpReason: null,
  };
}
