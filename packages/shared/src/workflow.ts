/**
 * OpenDoor workflow model — triggers, templates, retries, SLA, and graph helpers.
 * Dashboard and gateway runners share this; I/O stays in each app.
 */

export const WORKFLOW_TRIGGER_TYPES = [
  "manual",
  "webhook",
  "schedule",
  "inbound",
  "agent_event",
  "record",
] as const;

export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];

export type WorkflowTrigger = {
  type: WorkflowTriggerType;
  cron?: string;
  timezone?: string;
  event?: string;
  recordAction?: string;
};

export const WORKFLOW_NODE_TYPES = [
  "input",
  "output",
  "llm",
  "tool",
  "condition",
  "transform",
  "human_review",
  "wait",
  "loop",
  "assign",
  "http",
  "set_variable",
  "subflow",
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export type TemplateContext = {
  input: string;
  query?: string;
  vars: Record<string, string>;
  steps: Record<string, { text?: string; status?: string; passed?: boolean }>;
  payload?: Record<string, unknown>;
  item?: string;
  index?: number;
};

export type RetryPolicy = {
  retries: number;
  delayMs: number;
  onError: "fail" | "continue";
};

export const SYNC_WAIT_LIMIT_MS = 8_000;
export const MAX_LOOP_ITEMS = 20;
export const MAX_SUBFLOW_DEPTH = 3;
export const MAX_CRON_LOOKAHEAD_MINUTES = 366 * 24 * 60;

export function isTriggerType(value: unknown): value is WorkflowTriggerType {
  return typeof value === "string" && (WORKFLOW_TRIGGER_TYPES as readonly string[]).includes(value);
}

export function normalizeTrigger(raw: unknown): WorkflowTrigger {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const type = isTriggerType(obj.type) ? obj.type : "manual";
  const cron = typeof obj.cron === "string" ? obj.cron.trim() : "";
  const timezone = typeof obj.timezone === "string" ? obj.timezone.trim() : "";
  const event = typeof obj.event === "string" ? obj.event.trim() : "";
  const recordAction = typeof obj.recordAction === "string" ? obj.recordAction.trim() : "";
  return {
    type,
    ...(cron ? { cron } : {}),
    ...(timezone ? { timezone } : {}),
    ...(event ? { event } : {}),
    ...(recordAction ? { recordAction } : {}),
  };
}

export function triggerNeedsSecret(type: WorkflowTriggerType): boolean {
  return type === "webhook" || type === "inbound" || type === "agent_event" || type === "record";
}

export function triggerMatchesEvent(trigger: WorkflowTrigger, body: Record<string, unknown>): boolean {
  if (trigger.type === "agent_event" && trigger.event) {
    const event = typeof body.event === "string" ? body.event.trim() : "";
    return event === trigger.event;
  }
  if (trigger.type === "record" && trigger.recordAction) {
    const action = typeof body.action === "string" ? body.action.trim() : "";
    return action === trigger.recordAction;
  }
  return true;
}

export function graphForLiveRun(workflow: {
  graph?: unknown;
  publishedGraph?: unknown;
  publishedVersion?: number | null;
}): { nodes?: unknown[]; edges?: unknown[] } {
  const published = workflow.publishedGraph;
  if ((workflow.publishedVersion || 0) > 0 && published && typeof published === "object") {
    return published as { nodes?: unknown[]; edges?: unknown[] };
  }
  return (workflow.graph || { nodes: [], edges: [] }) as { nodes?: unknown[]; edges?: unknown[] };
}

export function nextPublishedVersion(current: number | null | undefined): number {
  return Math.max(0, Number(current) || 0) + 1;
}

function lookupPath(ctx: TemplateContext, path: string): string | undefined {
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return undefined;

  if (parts[0] === "input" && parts.length === 1) return ctx.input;
  if (parts[0] === "query") return ctx.query ?? ctx.input;
  if (parts[0] === "item") return ctx.item ?? "";
  if (parts[0] === "index") return String(ctx.index ?? 0);

  if (parts[0] === "vars" && parts[1]) return ctx.vars[parts[1]];
  if (parts[0] === "input" && parts[1] === "query") return ctx.query ?? ctx.input;

  if (parts[0] === "steps" && parts[1]) {
    const step = ctx.steps[parts[1]];
    if (!step) return undefined;
    if (!parts[2] || parts[2] === "text") return step.text ?? "";
    if (parts[2] === "status") return step.status ?? "";
    if (parts[2] === "passed") return step.passed == null ? "" : String(step.passed);
    return undefined;
  }

  if (parts[0] === "payload" && ctx.payload) {
    let cur: unknown = ctx.payload;
    for (const key of parts.slice(1)) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    if (cur == null) return undefined;
    return typeof cur === "string" ? cur : JSON.stringify(cur);
  }

  if (parts.length === 1 && ctx.vars[parts[0]] != null) return ctx.vars[parts[0]];
  return undefined;
}

export function interpolate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, raw: string) => lookupPath(ctx, raw.trim()) ?? "");
}

export function parseVariables(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim();
    if (!name) continue;
    if (typeof value === "string") out[name] = value;
    else if (value == null) continue;
    else out[name] = String(value);
  }
  return out;
}

export function retryPolicy(data: Record<string, unknown> | undefined): RetryPolicy {
  const src = data || {};
  const retries = Number(src.retryCount ?? src.retries ?? 0);
  const delayMs = Number(src.retryDelayMs ?? src.retryDelay ?? 250);
  return {
    retries: Number.isFinite(retries) ? Math.max(0, Math.min(3, Math.floor(retries))) : 0,
    delayMs: Number.isFinite(delayMs) ? Math.max(0, Math.min(5_000, Math.floor(delayMs))) : 250,
    onError: src.onError === "fail" ? "fail" : "continue",
  };
}

export function waitDurationMs(data: Record<string, unknown> | undefined): number {
  const src = data || {};
  const seconds = Number(src.waitSeconds ?? src.seconds ?? 0);
  const minutes = Number(src.waitMinutes ?? src.minutes ?? 0);
  const ms =
    (Number.isFinite(seconds) ? seconds : 0) * 1000 +
    (Number.isFinite(minutes) ? minutes : 0) * 60_000;
  return Math.max(0, Math.min(ms, 24 * 60 * 60 * 1000));
}

export function slaDueAt(dueMinutes: unknown, from = new Date()): Date | null {
  const n = Number(dueMinutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(from.getTime() + n * 60_000);
}

export function slaBreached(dueAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!dueAt) return false;
  const t = dueAt instanceof Date ? dueAt.getTime() : new Date(dueAt).getTime();
  return Number.isFinite(t) && now.getTime() > t;
}

export function parseLoopItems(raw: string, max = MAX_LOOP_ITEMS): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const cap = Math.max(1, Math.min(MAX_LOOP_ITEMS, max));
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as unknown;
      if (Array.isArray(arr)) {
        return arr
          .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
          .filter((s) => s.trim().length > 0)
          .slice(0, cap);
      }
    } catch {
      /* fall through to lines */
    }
  }
  return trimmed
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, cap);
}

export function resolveAssignee(data: Record<string, unknown> | undefined, ctx: TemplateContext): string {
  const src = data || {};
  const raw = typeof src.assignee === "string" && src.assignee.trim()
    ? src.assignee
    : typeof src.queue === "string"
      ? src.queue
      : "";
  return interpolate(raw, ctx).trim();
}

function parseCronPart(field: string, min: number, max: number): Set<number> | null {
  const values = new Set<number>();
  const bits = field.split(",");
  for (const bitRaw of bits) {
    const bit = bitRaw.trim();
    if (!bit) return null;
    if (bit === "*") {
      for (let n = min; n <= max; n++) values.add(n);
      continue;
    }
    const rangeStep = bit.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (rangeStep) {
      const step = Number(rangeStep[2]);
      if (!Number.isFinite(step) || step <= 0) return null;
      let start = min;
      let end = max;
      if (rangeStep[1] !== "*") {
        const [a, b] = rangeStep[1].split("-").map(Number);
        start = a;
        end = Number.isFinite(b) ? b : a;
      }
      if (start < min || end > max || start > end) return null;
      for (let n = start; n <= end; n += step) values.add(n);
      continue;
    }
    if (bit.includes("-")) {
      const [a, b] = bit.split("-").map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < min || b > max || a > b) return null;
      for (let n = a; n <= b; n++) values.add(n);
      continue;
    }
    const n = Number(bit);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    values.add(n);
  }
  return values;
}

export function parseCron(expression: string): {
  minute: Set<number>;
  hour: Set<number>;
  day: Set<number>;
  month: Set<number>;
  dow: Set<number>;
} | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute = parseCronPart(parts[0], 0, 59);
  const hour = parseCronPart(parts[1], 0, 23);
  const day = parseCronPart(parts[2], 1, 31);
  const month = parseCronPart(parts[3], 1, 12);
  const dow = parseCronPart(parts[4], 0, 7);
  if (!minute || !hour || !day || !month || !dow) return null;
  if (dow.has(7)) dow.add(0);
  return { minute, hour, day, month, dow };
}

export function cronMatches(expression: string, at: Date): boolean {
  const parsed = parseCron(expression);
  if (!parsed) return false;
  const dow = at.getUTCDay();
  return (
    parsed.minute.has(at.getUTCMinutes()) &&
    parsed.hour.has(at.getUTCHours()) &&
    parsed.day.has(at.getUTCDate()) &&
    parsed.month.has(at.getUTCMonth() + 1) &&
    (parsed.dow.has(dow) || parsed.dow.has(7))
  );
}

export function nextCronRun(expression: string, from: Date): Date | null {
  if (!parseCron(expression)) return null;
  const start = new Date(from.getTime());
  start.setUTCSeconds(0, 0);
  for (let i = 1; i <= MAX_CRON_LOOKAHEAD_MINUTES; i++) {
    const candidate = new Date(start.getTime() + i * 60_000);
    if (cronMatches(expression, candidate)) return candidate;
  }
  return null;
}

export type ConditionResult =
  | { ok: true; passed: boolean }
  | { ok: false; error: string };

const CONDITION_HINT =
  'Unsupported condition. Use includes("text"), equals("text"), startsWith("text"), length > N, or true/false.';

function unquote(raw: string): string | null {
  if (raw.length < 2) return null;
  const q = raw[0];
  if ((q !== '"' && q !== "'") || raw[raw.length - 1] !== q) return null;
  const inner = raw.slice(1, -1);
  if (inner.includes("\\")) {
    return inner.replace(/\\([\\'"n])/g, (_, ch: string) => (ch === "n" ? "\n" : ch));
  }
  return inner;
}

function cmpLength(output: string, op: string, n: number): boolean {
  const len = output.length;
  if (op === "==" || op === "=") return len === n;
  if (op === "!=") return len !== n;
  if (op === ">") return len > n;
  if (op === ">=") return len >= n;
  if (op === "<") return len < n;
  if (op === "<=") return len <= n;
  return false;
}

export function evaluateCondition(expression: string, output: string): ConditionResult {
  let expr = expression.trim();
  if (!expr) {
    return { ok: true, passed: output.trim().length > 0 };
  }

  let negate = false;
  if (expr.startsWith("!") || /^not\s+/i.test(expr)) {
    negate = true;
    expr = expr.replace(/^!/, "").replace(/^not\s+/i, "").trim();
  }

  const lower = expr.toLowerCase();
  if (lower === "true" || lower === "yes" || lower === "1") {
    return { ok: true, passed: negate ? false : true };
  }
  if (lower === "false" || lower === "no" || lower === "0") {
    return { ok: true, passed: negate ? true : false };
  }

  let body = expr;
  if (/^output\s*\./i.test(body)) body = body.replace(/^output\s*\./i, "");
  else if (/^output\s+/i.test(body)) body = body.replace(/^output\s+/i, "");

  const method = body.match(
    /^(includes|contains|equals|startswith|endswith)\(\s*(["'])((?:[^\\]|\\.)*)\2\s*\)$/i
  );
  if (method) {
    const fn = method[1].toLowerCase();
    const lit = unquote(`${method[2]}${method[3]}${method[2]}`);
    if (lit == null) return { ok: false, error: CONDITION_HINT };
    let passed = false;
    if (fn === "includes" || fn === "contains") passed = output.includes(lit);
    else if (fn === "equals") passed = output === lit;
    else if (fn === "startswith") passed = output.startsWith(lit);
    else if (fn === "endswith") passed = output.endsWith(lit);
    return { ok: true, passed: negate ? !passed : passed };
  }

  const eq = body.match(/^(?:output\s*)?(===|==|!=)\s*(["'])((?:[^\\]|\\.)*)\2$/i);
  if (eq) {
    const lit = unquote(`${eq[2]}${eq[3]}${eq[2]}`);
    if (lit == null) return { ok: false, error: CONDITION_HINT };
    const passed = eq[1] === "!=" ? output !== lit : output === lit;
    return { ok: true, passed: negate ? !passed : passed };
  }

  const len = body.match(/^length\s*(==|=|!=|<=|>=|<|>)\s*(\d+)$/i);
  if (len) {
    const passed = cmpLength(output, len[1], Number(len[2]));
    return { ok: true, passed: negate ? !passed : passed };
  }

  return { ok: false, error: CONDITION_HINT };
}

export function conditionEdgeTaken(
  edge: { sourceHandle?: string; label?: unknown },
  passed: boolean
): boolean | null {
  const handle = (edge.sourceHandle || "").trim().toLowerCase();
  const label = (typeof edge.label === "string" ? edge.label : "").trim().toLowerCase();
  const tag = handle || label;
  if (!tag) return null;
  if (tag === "true" || tag === "yes") return passed;
  if (tag === "false" || tag === "no") return !passed;
  return null;
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "metadata.google.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export function assertPublicHttpsUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "HTTP step needs a valid URL." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "HTTP steps only allow https:// destinations." };
  }
  if (isPrivateHostname(url.hostname)) {
    return { ok: false, error: "HTTP steps cannot target private or loopback hosts." };
  }
  return { ok: true, url };
}
