#!/usr/bin/env bun
/**
 * Thin OpenDoor CLI — same contract as a Fireworks firectl subset.
 * Usage: bun run od -- <command>
 */

const base = (process.env.OPENDOOR_API_URL || "http://localhost:3001").replace(/\/$/, "");
const key = process.env.OPENDOOR_API_KEY || process.env.LOCAL_API_KEY || "";

function arg(name: string, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || fallback : fallback;
}

async function api(path: string, init?: RequestInit) {
  if (!key) {
    console.error("Set OPENDOOR_API_KEY (or LOCAL_API_KEY)");
    process.exit(1);
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

const cmd = process.argv[2] || "help";

if (cmd === "help" || cmd === "--help") {
  console.log(`opendoor CLI

  models
  chat --model <id> --message <text>
  embeddings --model <id> --input <text>
  rerank --model <id> --query <text> --documents a||b
  batches create --file <json>
  batches get --id <uuid>
  batches list
`);
  process.exit(0);
}

if (cmd === "models") {
  const { body } = await api("/v1/models");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "chat") {
  const model = arg("--model", "llama-3.1-8b-instruct");
  const message = arg("--message", "Hello");
  const { body } = await api("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: message }],
    }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "embeddings") {
  const { body } = await api("/v1/embeddings", {
    method: "POST",
    body: JSON.stringify({
      model: arg("--model", "text-embedding-3-small"),
      input: arg("--input", "hello"),
    }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "rerank") {
  const { body } = await api("/v1/rerank", {
    method: "POST",
    body: JSON.stringify({
      model: arg("--model", "rerank-v3.5"),
      query: arg("--query"),
      documents: arg("--documents").split("||").filter(Boolean),
    }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "batches" && process.argv[3] === "list") {
  const { body } = await api("/v1/batches");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "batches" && process.argv[3] === "get") {
  const { body } = await api(`/v1/batches/${arg("--id")}`);
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "batches" && process.argv[3] === "create") {
  const file = arg("--file");
  const payload = file
    ? JSON.parse(await Bun.file(file).text())
    : { requests: [] };
  const { body } = await api("/v1/batches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  console.log(JSON.stringify(body, null, 2));
} else {
  console.error(`Unknown command: ${cmd}. Run with --help`);
  process.exit(1);
}
