/**
 * Ingest open-weight models from Hugging Face + Ollama library tags.
 * Lists new repos the same day (warming), promotes to live when we have
 * a provider adapter or a known Ollama tag map.
 *
 * Usage:
 *   bun --env-file=.env run scripts/ingest-open-models.ts
 */

import { db, modelCatalog, models, providers } from "../packages/database/src/index.ts";
import { eq } from "drizzle-orm";

const HF_ORGS = [
  "Qwen",
  "deepseek-ai",
  "THUDM",
  "meta-llama",
  "google",
  "mistralai",
  "moonshotai",
  "01-ai",
] as const;

const ORG_ORIGIN: Record<string, string> = {
  Qwen: "cn",
  "deepseek-ai": "cn",
  THUDM: "cn",
  "meta-llama": "us",
  google: "us",
  mistralai: "eu",
  moonshotai: "cn",
  "01-ai": "cn",
};

/** Known Ollama tags → promote to live/dedicated instead of warming-only. */
const OLLAMA_TAG_MAP: Record<string, string> = {
  "meta-llama/Llama-3.2-3B-Instruct": "llama3.2:3b",
  "meta-llama/Meta-Llama-3.1-8B-Instruct": "llama3.1:8b",
  "meta-llama/Llama-3.1-8B-Instruct": "llama3.1:8b",
  "mistralai/Mistral-7B-Instruct-v0.3": "mistral:7b",
  "Qwen/Qwen2.5-7B-Instruct": "qwen2.5:7b",
  "google/gemma-2-9b-it": "gemma2:9b",
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B": "deepseek-r1:7b",
};

/** Provider API model IDs we can serve live without a local GPU. */
const PROVIDER_API_LIVE = new Set([
  "deepseek-chat",
  "deepseek-coder",
  "qwen-max",
  "qwen-plus",
  "qwen-turbo",
  "qwen-coder-plus",
  "mistral-large-latest",
  "mistral-medium-latest",
  "mistral-small-latest",
  "codestral-latest",
]);

type HfModel = {
  id: string;
  modelId: string;
  likes?: number;
  downloads?: number;
  pipeline_tag?: string;
  tags?: string[];
};

function slugifyModelId(hfId: string): string {
  return hfId
    .split("/")
    .pop()!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function fetchOrgModels(org: string): Promise<HfModel[]> {
  const url = `https://huggingface.co/api/models?author=${encodeURIComponent(org)}&sort=downloads&direction=-1&limit=25&filter=text-generation`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "OpenDoor-ingest/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.warn(`HF ${org}: ${res.status}`);
    return [];
  }
  const data = (await res.json()) as Array<{
    id: string;
    likes?: number;
    downloads?: number;
    pipeline_tag?: string;
    tags?: string[];
  }>;
  return data.map((m) => ({
    id: m.id,
    modelId: slugifyModelId(m.id),
    likes: m.likes,
    downloads: m.downloads,
    pipeline_tag: m.pipeline_tag,
    tags: m.tags,
  }));
}

async function fetchOllamaLibraryTags(): Promise<string[]> {
  try {
    const res = await fetch("https://ollama.com/library", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const tags = new Set<string>();
    const re = /href="\/library\/([a-z0-9._:-]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
      tags.add(match[1]);
    }
    return Array.from(tags).slice(0, 80);
  } catch {
    return [];
  }
}

function resolveStatus(hfRepo: string, modelId: string): {
  status: string;
  ollamaTag: string | null;
  source: string;
} {
  if (PROVIDER_API_LIVE.has(modelId)) {
    return { status: "live", ollamaTag: null, source: "provider_api" };
  }
  const tag = OLLAMA_TAG_MAP[hfRepo] || null;
  if (tag === "llama3.2:3b") {
    return { status: "live", ollamaTag: tag, source: "ollama" };
  }
  if (tag) {
    return { status: "dedicated", ollamaTag: tag, source: "ollama" };
  }
  return { status: "warming", ollamaTag: null, source: "huggingface" };
}

async function ensureOllamaProviderId(): Promise<string | null> {
  const row = await db.query.providers.findFirst({
    where: eq(providers.slug, "ollama"),
  });
  return row?.id ?? null;
}

async function ingest() {
  console.log("🔍 Ingesting open-weight models from Hugging Face…");
  let catalogUpserts = 0;
  let modelsUpserts = 0;

  const ollamaProviderId = await ensureOllamaProviderId();

  for (const org of HF_ORGS) {
    const items = await fetchOrgModels(org);
    console.log(`  ${org}: ${items.length} models`);
    for (const item of items) {
      const { status, ollamaTag, source } = resolveStatus(item.id, item.modelId);
      const origin = ORG_ORIGIN[org] || "global";
      const displayName = item.id.split("/").pop()!.replace(/-/g, " ");

      await db
        .insert(modelCatalog)
        .values({
          modelId: item.modelId,
          displayName,
          description: `Open-weight from ${item.id} (HF downloads: ${item.downloads ?? 0}).`,
          huggingFaceRepo: item.id,
          ollamaTag,
          inferenceEngine: ollamaTag ? "ollama" : "vllm",
          defaultCpu: "2.0",
          defaultMemoryGb: "4.0",
          origin,
          source,
          deploymentStatus: status,
          listedAt: new Date(),
          enabled: true,
        })
        .onConflictDoNothing({ target: modelCatalog.modelId });
      catalogUpserts++;

      if (ollamaProviderId && (status === "live" || status === "dedicated" || status === "warming")) {
        try {
          await db
            .insert(models)
            .values({
              providerId: ollamaProviderId,
              modelId: ollamaTag || item.modelId,
              displayName,
              contextWindow: 128000,
              family: "open_weight",
              deploymentStatus: status,
              origin,
              source,
              huggingFaceRepo: item.id,
              ollamaTag,
              listedAt: new Date(),
              enabled: true,
            })
            .onConflictDoNothing();
          modelsUpserts++;
        } catch {
          /* unique conflict on provider+model */
        }
      }
    }
  }

  const ollamaTags = await fetchOllamaLibraryTags();
  console.log(`📚 Ollama library tags discovered: ${ollamaTags.length}`);
  for (const tag of ollamaTags.slice(0, 40)) {
    const modelId = tag.includes(":") ? tag : `${tag}:latest`;
    await db
      .insert(modelCatalog)
      .values({
        modelId: `ollama-${tag.replace(/[:/]/g, "-")}`.slice(0, 100),
        displayName: `Ollama ${tag}`,
        description: `Listed from Ollama library. Pull with: ollama pull ${tag}`,
        ollamaTag: tag,
        inferenceEngine: "ollama",
        defaultCpu: "2.0",
        defaultMemoryGb: "4.0",
        origin: "global",
        source: "ollama",
        deploymentStatus: tag === "llama3.2" || tag.startsWith("llama3.2") ? "live" : "dedicated",
        listedAt: new Date(),
        enabled: true,
      })
      .onConflictDoNothing({ target: modelCatalog.modelId });
    catalogUpserts++;
  }

  console.log(`✅ Done. Catalog writes attempted: ${catalogUpserts}, models writes: ${modelsUpserts}`);
  process.exit(0);
}

ingest().catch((err) => {
  console.error("Ingest failed:", err);
  process.exit(1);
});
