/**
 * Tiny boolean evaluator for workflow condition nodes. No eval / Function / regex.
 * Prior step output is the only input.
 */

export type ConditionResult =
  | { ok: true; passed: boolean }
  | { ok: false; error: string };

const HINT =
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
    if (lit == null) return { ok: false, error: HINT };
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
    if (lit == null) return { ok: false, error: HINT };
    const passed = eq[1] === "!=" ? output !== lit : output === lit;
    return { ok: true, passed: negate ? !passed : passed };
  }

  const len = body.match(/^length\s*(==|=|!=|<=|>=|<|>)\s*(\d+)$/i);
  if (len) {
    const passed = cmpLength(output, len[1], Number(len[2]));
    return { ok: true, passed: negate ? !passed : passed };
  }

  return { ok: false, error: HINT };
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
