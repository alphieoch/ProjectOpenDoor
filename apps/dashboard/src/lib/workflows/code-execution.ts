/**
 * Workflow code_execution runner.
 *
 * Preference (see runWorkflowCode):
 *   1. Linux + FIRECRACKER_SOCKET — optional jailer over a Unix socket (not faked on macOS)
 *   2. CODE_SANDBOX_URL + CODE_SANDBOX_TOKEN — Cloud Run gVisor jail (opendoor-sandbox)
 *   3. Local execFile subprocess (this file) when CODE_SANDBOX_URL is unset
 *
 * Local fallback: execFile only (no shell, no eval in the Next.js process). Timeout ~5s.
 * JS uses Node's permission model when available (no network). Python uses
 * resource limits; network is not disabled on macOS.
 */
import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 5_000;
const MAX_CODE_BYTES = 32 * 1024;
const MAX_STDIN_BYTES = 64 * 1024;
const MAX_BUFFER = 64 * 1024;

export type CodeLanguage = "python" | "javascript";

export type CodeJail = "gvisor" | "firecracker" | "local";

export type IsolatedRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  language: CodeLanguage;
  jail?: CodeJail;
};

export function resolveCodeLanguage(raw: unknown): CodeLanguage | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s || s === "javascript" || s === "js" || s === "node") return "javascript";
  if (s === "python" || s === "py") return "python";
  return null;
}

function isNodeBin(bin: string): boolean {
  return !/bun/i.test(bin);
}

async function resolveNodeBin(): Promise<string> {
  if (isNodeBin(process.execPath)) return process.execPath;
  try {
    await execFileAsync("node", ["-v"], { timeout: 3_000, windowsHide: true });
    return "node";
  } catch {
    return process.execPath;
  }
}

function nodePermissionArgs(dir: string): string[] {
  const major = Number(String(process.versions.node || "0").split(".")[0]);
  if (!Number.isFinite(major) || major < 20) return [];
  const flag = major >= 22 ? "--permission" : "--experimental-permission";
  // Read=* so Node can realpath tmpdir ancestors. Writes stay in scratch.
  // No --allow-net / --allow-child-process.
  const writes = new Set<string>([dir]);
  try {
    writes.add(realpathSync(dir));
  } catch {
    /* dir is enough */
  }
  return [flag, "--allow-fs-read=*", ...[...writes].map((p) => `--allow-fs-write=${p}`)];
}

async function resolvePythonBin(): Promise<string | null> {
  const names = [process.env.PYTHON3, process.env.PYTHON, "python3", "python"].filter(
    (v): v is string => Boolean(v && !v.includes(" "))
  );
  for (const bin of names) {
    try {
      await execFileAsync(bin, ["-V"], { timeout: 3_000, windowsHide: true });
      return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

const PY_LIMITS = `import resource
import runpy
import sys

def _limit(name, soft, hard=None):
    try:
        resource.setrlimit(name, (soft, hard if hard is not None else soft))
    except Exception:
        pass

_limit(resource.RLIMIT_CPU, 5)
_limit(resource.RLIMIT_FSIZE, 2 * 1024 * 1024)
_limit(resource.RLIMIT_NPROC, 16)
_limit(resource.RLIMIT_NOFILE, 32)
if hasattr(resource, "RLIMIT_AS"):
    _limit(resource.RLIMIT_AS, 256 * 1024 * 1024)

runpy.run_path(sys.argv[1], run_name="__main__")
`;

function trimOut(s: string): string {
  return s.length > 8_000 ? `${s.slice(0, 8_000)}\n…truncated` : s;
}

export async function runIsolatedCode(opts: {
  language: CodeLanguage;
  code: string;
  stdin?: string;
}): Promise<IsolatedRunResult> {
  if (opts.code.includes("\0")) {
    throw new Error("Code contains a null byte.");
  }
  if (Buffer.byteLength(opts.code, "utf8") > MAX_CODE_BYTES) {
    throw new Error(`Code exceeds ${MAX_CODE_BYTES} byte limit.`);
  }
  const stdin = (opts.stdin || "").slice(0, MAX_STDIN_BYTES);
  const scratch = path.join(process.cwd(), "tmp");
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch, "od-code-"));
  const env = {
    PATH: process.env.PATH || "/usr/bin:/bin:/usr/local/bin",
    HOME: dir,
    TMPDIR: dir,
    NO_COLOR: "1",
    NODE_OPTIONS: "",
  };

  try {
    await writeFile(path.join(dir, "input.txt"), stdin, "utf8");

    if (opts.language === "javascript") {
      const script = path.join(dir, "main.js");
      await writeFile(script, opts.code, "utf8");
      const nodeBin = await resolveNodeBin();
      const args = [
        "--max-old-space-size=64",
        "--no-warnings",
        ...(isNodeBin(nodeBin) ? nodePermissionArgs(dir) : []),
        script,
      ];
      return await runChild(nodeBin, args, { dir, env, stdin, language: "javascript" });
    }

    const python = await resolvePythonBin();
    if (!python) {
      throw new Error("Python is not available. Install python3 or set PYTHON3, or use language javascript.");
    }
    const script = path.join(dir, "main.py");
    const wrapper = path.join(dir, "_limits.py");
    await writeFile(script, opts.code, "utf8");
    await writeFile(wrapper, PY_LIMITS, "utf8");
    return await runChild(python, [wrapper, script], { dir, env, stdin, language: "python" });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runChild(
  bin: string,
  args: string[],
  opts: { dir: string; env: NodeJS.ProcessEnv; stdin: string; language: CodeLanguage }
): Promise<IsolatedRunResult> {
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      {
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        cwd: opts.dir,
        env: opts.env,
        windowsHide: true,
        killSignal: "SIGKILL",
      },
      (err, stdout, stderr) => {
        const e = err as {
          killed?: boolean;
          code?: string | number;
          signal?: string;
        } | null;
        const timedOut =
          Boolean(e?.killed) || e?.signal === "SIGKILL" || e?.code === "ETIMEDOUT";
        const exitCode = err ? (typeof e?.code === "number" ? e.code : null) : 0;
        resolve({
          stdout: trimOut(stdout || ""),
          stderr: trimOut(
            (stderr || "").trim()
              ? stderr
              : timedOut
                ? "Timed out after 5s"
                : err
                  ? err.message
                  : ""
          ),
          exitCode,
          timedOut,
          language: opts.language,
          jail: "local",
        });
      }
    );
    child.stdin?.write(opts.stdin);
    child.stdin?.end();
  });
}

const REMOTE_TIMEOUT_MS = 15_000;

function sandboxBaseUrl(): string {
  return (process.env.CODE_SANDBOX_URL || "").trim().replace(/\/$/, "");
}

function isIsolatedRunResult(value: unknown): value is IsolatedRunResult {
  if (!value || typeof value !== "object") return false;
  const v = value as IsolatedRunResult;
  return typeof v.stdout === "string" && typeof v.stderr === "string" && typeof v.language === "string";
}

/**
 * Optional Linux jailer. Speaks one JSON request / JSON response over a Unix socket.
 * Never used on macOS — Firecracker/KVM is not available there, and we do not fake it.
 */
async function runFirecrackerJail(opts: {
  language: CodeLanguage;
  code: string;
  stdin?: string;
}): Promise<IsolatedRunResult> {
  const socketPath = (process.env.FIRECRACKER_SOCKET || "").trim();
  if (!socketPath) {
    throw new Error("FIRECRACKER_SOCKET is not set.");
  }
  if (!existsSync(socketPath)) {
    throw new Error(`Firecracker socket not found: ${socketPath}`);
  }
  return new Promise((resolve, reject) => {
    const sock = connect({ path: socketPath });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error("Firecracker jail timed out."));
    }, REMOTE_TIMEOUT_MS);
    sock.on("connect", () => {
      sock.write(
        JSON.stringify({
          language: opts.language,
          code: opts.code,
          stdin: opts.stdin || "",
        }) + "\n"
      );
    });
    sock.on("data", (c) => chunks.push(c));
    sock.on("end", () => {
      clearTimeout(timer);
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!isIsolatedRunResult(parsed)) {
          reject(new Error("Firecracker jailer returned an unexpected payload."));
          return;
        }
        resolve({ ...parsed, jail: "firecracker" });
      } catch {
        reject(new Error("Firecracker jailer returned invalid JSON."));
      }
    });
    sock.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Firecracker socket error: ${err.message}`));
    });
  });
}

async function runRemoteSandbox(opts: {
  language: CodeLanguage;
  code: string;
  stdin?: string;
}): Promise<IsolatedRunResult> {
  const base = sandboxBaseUrl();
  const token = (process.env.CODE_SANDBOX_TOKEN || "").trim();
  if (!base) {
    throw new Error("CODE_SANDBOX_URL is not set.");
  }
  if (!token) {
    throw new Error("CODE_SANDBOX_URL is set but CODE_SANDBOX_TOKEN is missing.");
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REMOTE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/internal/sandbox/exec`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        language: opts.language,
        code: opts.code,
        stdin: opts.stdin || "",
      }),
      signal: ac.signal,
    });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err =
        body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : `Sandbox HTTP ${res.status}`;
      throw new Error(err);
    }
    if (!isIsolatedRunResult(body)) {
      throw new Error("Sandbox returned an unexpected payload.");
    }
    return { ...body, jail: body.jail || "gvisor" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Code sandbox timed out.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prefer a real jail: Firecracker (Linux socket only) → Cloud Run gVisor → local subprocess.
 */
export async function runWorkflowCode(opts: {
  language: CodeLanguage;
  code: string;
  stdin?: string;
}): Promise<IsolatedRunResult> {
  if (process.platform === "linux" && (process.env.FIRECRACKER_SOCKET || "").trim()) {
    return runFirecrackerJail(opts);
  }
  if (sandboxBaseUrl()) {
    return runRemoteSandbox(opts);
  }
  return runIsolatedCode(opts);
}
