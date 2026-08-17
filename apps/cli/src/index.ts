#!/usr/bin/env bun
/**
 * Thin OpenDoor CLI — same contract as a Fireworks firectl subset.
 * Usage: bun run od -- <command>
 */

const base = (
  process.env.OPENDOOR_BASE_URL ||
  process.env.OPENDOOR_API_URL ||
  "http://localhost:3001"
).replace(/\/$/, "");
const key = process.env.OPENDOOR_API_KEY || process.env.LOCAL_API_KEY || "";

function arg(name: string, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || fallback : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function api(path: string, init?: RequestInit) {
  if (!key) {
    console.error("Set OPENDOOR_API_KEY (or LOCAL_API_KEY)");
    process.exit(1);
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    ...((init?.headers as Record<string, string> | undefined) || {}),
  };
  if (!(init?.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

function chatProvider() {
  const provider: {
    sort?: string;
    allow_fallbacks?: boolean;
    order?: string[];
  } = {};
  const sort = arg("--provider-sort");
  if (sort) provider.sort = sort;
  if (hasFlag("--no-fallbacks")) provider.allow_fallbacks = false;
  const order = arg("--provider-order")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (order.length) provider.order = order;
  return Object.keys(provider).length ? provider : undefined;
}

const cmd = process.argv[2] || "help";

if (cmd === "help" || cmd === "--help") {
  console.log(`opendoor CLI

  catalog
  account
  usage [--days 30]
  models
  chat --model <id> --message <text> [--provider-sort price|latency|throughput] [--no-fallbacks] [--provider-order a,b]
  embeddings --model <id> --input <text>
  rerank --model <id> --query <text> --documents a||b
  assistants list
  assistants create --name <name> --model <id>
  assistants chat --id <id> --message <text>
  workflows list
  workflows run --id <id> --query <text>
  training jobs
  deployments list
  agents list
  byok list
  keys list
  requests [--limit 20]
  batches create --file <json>
  batches get --id <uuid>
  batches list
  generation get --id <id>
  images generate --prompt <text> --model <id>
  videos generate --prompt <text> --model <id> [--duration 4]
  videos get --id <id>
  audio transcribe --file <path> --model <id>
`);
  process.exit(0);
}

if (cmd === "catalog") {
  const { body } = await api("/v1/catalog");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "account") {
  const { body } = await api("/v1/account");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "usage") {
  const days = arg("--days", "30");
  const { body } = await api(`/v1/usage?days=${encodeURIComponent(days)}`);
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "models") {
  const { body } = await api("/v1/models");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "assistants" && process.argv[3] === "list") {
  const { body } = await api("/v1/assistants");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "assistants" && process.argv[3] === "create") {
  const { body } = await api("/v1/assistants", {
    method: "POST",
    body: JSON.stringify({
      name: arg("--name", "Assistant"),
      modelId: arg("--model", "opendoor/auto"),
      systemPrompt: arg("--system") || undefined,
    }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "assistants" && process.argv[3] === "chat") {
  const { body } = await api(`/v1/assistants/${arg("--id")}/chat`, {
    method: "POST",
    body: JSON.stringify({
      messages: [{ role: "user", content: arg("--message", "Hello") }],
    }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "workflows" && process.argv[3] === "list") {
  const { body } = await api("/v1/workflows");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "workflows" && process.argv[3] === "run") {
  const { body } = await api(`/v1/workflows/${arg("--id")}/run`, {
    method: "POST",
    body: JSON.stringify({ query: arg("--query", "") }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "training" && process.argv[3] === "jobs") {
  const { body } = await api("/v1/training/jobs");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "deployments" && process.argv[3] === "list") {
  const { body } = await api("/v1/deployments");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "agents" && process.argv[3] === "list") {
  const { body } = await api("/v1/agents");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "byok" && process.argv[3] === "list") {
  const { body } = await api("/v1/byok");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "keys" && process.argv[3] === "list") {
  const { body } = await api("/v1/keys");
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "requests") {
  const { body } = await api(`/v1/requests?limit=${arg("--limit", "20")}`);
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "chat") {
  const model = arg("--model", "llama-3.1-8b-instruct");
  const message = arg("--message", "Hello");
  const provider = chatProvider();
  const { body } = await api("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: message }],
      ...(provider ? { provider } : {}),
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
} else if (cmd === "generation" && process.argv[3] === "get") {
  const id = arg("--id");
  const { body } = await api(`/v1/generation/${id}`);
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "images" && process.argv[3] === "generate") {
  const { body } = await api("/v1/images/generations", {
    method: "POST",
    body: JSON.stringify({
      prompt: arg("--prompt"),
      model: arg("--model", "gemini-2.5-flash-image"),
    }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "videos" && process.argv[3] === "generate") {
  const duration = Number(arg("--duration", "4"));
  const { body } = await api("/v1/videos/generations", {
    method: "POST",
    body: JSON.stringify({
      prompt: arg("--prompt"),
      model: arg("--model", "veo-3.1-fast-generate-001"),
      ...(Number.isFinite(duration) ? { duration } : {}),
    }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "videos" && process.argv[3] === "get") {
  const { body } = await api(`/v1/videos/generations/${arg("--id")}`);
  console.log(JSON.stringify(body, null, 2));
} else if (cmd === "audio" && process.argv[3] === "transcribe") {
  const file = arg("--file");
  if (!file) {
    console.error("audio transcribe requires --file");
    process.exit(1);
  }
  const form = new FormData();
  form.append("file", Bun.file(file));
  form.append("model", arg("--model", "whisper-1"));
  const { body } = await api("/v1/audio/transcriptions", {
    method: "POST",
    body: form,
  });
  console.log(JSON.stringify(body, null, 2));
} else {
  console.error(`Unknown command: ${cmd}. Run with --help`);
  process.exit(1);
}
