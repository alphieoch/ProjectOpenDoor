/**
 * OpenDoor workflow code jail — Cloud Run (gVisor).
 * POST /internal/sandbox/exec  (CODE_SANDBOX_TOKEN required)
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { EXEC_TIMEOUT_MS, MAX_CODE_BYTES, MAX_STDIN_BYTES, resolveCodeLanguage, runIsolatedCode } from "./exec.mjs";

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.CODE_SANDBOX_TOKEN || "";
const MAX_BODY = MAX_CODE_BYTES + MAX_STDIN_BYTES + 4096;

function tokenOk(provided) {
  if (!TOKEN || !provided) return false;
  const a = createHash("sha256").update(TOKEN).digest();
  const b = createHash("sha256").update(String(provided)).digest();
  return timingSafeEqual(a, b);
}

function requestToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  const alt = req.headers["x-sandbox-token"] || req.headers["x-code-sandbox-token"];
  return Array.isArray(alt) ? alt[0] : alt || "";
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX_BODY) {
        const err = new Error("payload too large");
        err.status = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://sandbox.local");

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
    send(res, 200, {
      status: "ok",
      service: "opendoor-sandbox",
      jail: "gvisor",
      timeoutMs: EXEC_TIMEOUT_MS,
    });
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/internal/sandbox/exec") {
    send(res, 404, { error: "not found" });
    return;
  }

  if (!TOKEN) {
    send(res, 503, { error: "CODE_SANDBOX_TOKEN is not configured." });
    return;
  }
  if (!tokenOk(requestToken(req))) {
    send(res, 401, { error: "Unauthorized" });
    return;
  }

  let payload;
  try {
    const raw = await readBody(req);
    payload = raw ? JSON.parse(raw) : {};
  } catch (err) {
    send(res, err.status || 400, { error: err.status === 413 ? "Payload too large." : "Invalid JSON." });
    return;
  }

  const language = resolveCodeLanguage(payload.language ?? payload.lang);
  const code = typeof payload.code === "string" ? payload.code : "";
  if (!code.trim()) {
    send(res, 400, { error: "code is required." });
    return;
  }
  if (!language) {
    send(res, 400, { error: "language must be javascript or python." });
    return;
  }

  try {
    const result = await runIsolatedCode({
      language,
      code,
      stdin: typeof payload.stdin === "string" ? payload.stdin : "",
    });
    send(res, 200, result);
  } catch (err) {
    send(res, 400, { error: err instanceof Error ? err.message : "Code execution failed" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`opendoor-sandbox listening on ${PORT} (gVisor jail, exec timeout ${EXEC_TIMEOUT_MS}ms)`);
});
