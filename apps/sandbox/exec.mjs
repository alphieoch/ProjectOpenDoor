/**
 * Isolated JS/Python runner for the Cloud Run gVisor jail.
 * execFile only (no shell). Writes a tmpdir, then deletes it.
 */
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const EXEC_TIMEOUT_MS = 10_000;
export const MAX_CODE_BYTES = 32 * 1024;
export const MAX_STDIN_BYTES = 64 * 1024;
const MAX_BUFFER = 64 * 1024;

const PY_LIMITS = `import resource
import runpy
import sys

def _limit(name, soft, hard=None):
    try:
        resource.setrlimit(name, (soft, hard if hard is not None else soft))
    except Exception:
        pass

_limit(resource.RLIMIT_CPU, 8)
_limit(resource.RLIMIT_FSIZE, 2 * 1024 * 1024)
_limit(resource.RLIMIT_NPROC, 16)
_limit(resource.RLIMIT_NOFILE, 32)
if hasattr(resource, "RLIMIT_AS"):
    _limit(resource.RLIMIT_AS, 256 * 1024 * 1024)

runpy.run_path(sys.argv[1], run_name="__main__")
`;

export function resolveCodeLanguage(raw) {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s || s === "javascript" || s === "js" || s === "node") return "javascript";
  if (s === "python" || s === "py") return "python";
  return null;
}

function nodePermissionArgs(dir) {
  const major = Number(String(process.versions.node || "0").split(".")[0]);
  if (!Number.isFinite(major) || major < 20) return [];
  const flag = major >= 22 ? "--permission" : "--experimental-permission";
  // Read=* is required so Node can realpath ancestors (e.g. /var/folders on macOS,
  // /tmp on Cloud Run). Writes stay in the scratch dir. No --allow-net / child-process.
  const writes = new Set([dir]);
  try {
    writes.add(realpathSync(dir));
  } catch {
    /* dir is enough */
  }
  return [flag, "--allow-fs-read=*", ...[...writes].map((p) => `--allow-fs-write=${p}`)];
}

function trimOut(s) {
  return s.length > 8_000 ? `${s.slice(0, 8_000)}\n…truncated` : s;
}

export async function runIsolatedCode(opts) {
  if (opts.code.includes("\0")) {
    throw new Error("Code contains a null byte.");
  }
  if (Buffer.byteLength(opts.code, "utf8") > MAX_CODE_BYTES) {
    throw new Error(`Code exceeds ${MAX_CODE_BYTES} byte limit.`);
  }
  const language = resolveCodeLanguage(opts.language);
  if (!language) {
    throw new Error("language must be javascript or python.");
  }
  const stdin = String(opts.stdin || "").slice(0, MAX_STDIN_BYTES);
  const dir = await mkdtemp(path.join(tmpdir(), "od-code-"));
  const env = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: dir,
    TMPDIR: dir,
    NO_COLOR: "1",
    NODE_OPTIONS: "",
  };

  try {
    await writeFile(path.join(dir, "input.txt"), stdin, "utf8");

    if (language === "javascript") {
      const script = path.join(dir, "main.js");
      await writeFile(script, opts.code, "utf8");
      const args = [
        "--max-old-space-size=64",
        "--no-warnings",
        ...nodePermissionArgs(dir),
        script,
      ];
      return await runChild(process.execPath, args, { dir, env, stdin, language });
    }

    const script = path.join(dir, "main.py");
    const wrapper = path.join(dir, "_limits.py");
    await writeFile(script, opts.code, "utf8");
    await writeFile(wrapper, PY_LIMITS, "utf8");
    return await runChild("python3", [wrapper, script], { dir, env, stdin, language });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runChild(bin, args, opts) {
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      {
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        cwd: opts.dir,
        env: opts.env,
        windowsHide: true,
        killSignal: "SIGKILL",
      },
      (err, stdout, stderr) => {
        const e = err;
        const timedOut =
          Boolean(e?.killed) || e?.signal === "SIGKILL" || e?.code === "ETIMEDOUT";
        const exitCode = err ? (typeof e?.code === "number" ? e.code : null) : 0;
        resolve({
          stdout: trimOut(stdout || ""),
          stderr: trimOut(
            (stderr || "").trim()
              ? stderr
              : timedOut
                ? `Timed out after ${EXEC_TIMEOUT_MS / 1000}s`
                : err
                  ? err.message
                  : ""
          ),
          exitCode,
          timedOut,
          language: opts.language,
          jail: "gvisor",
        });
      }
    );
    child.stdin?.write(opts.stdin);
    child.stdin?.end();
  });
}
