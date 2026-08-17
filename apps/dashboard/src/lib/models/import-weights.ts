export type ImportTarget = "local" | "gcp" | "api" | "reserved";

export type ImportPlan = {
  source: string;
  kind: "huggingface" | "ollama";
  repo: string;
  modelId: string;
  displayName: string;
  origin: string;
  gated: boolean;
  downloads: number | null;
  parameterHint: string | null;
  estimatedBytes: number | null;
  recommended: ImportTarget;
  reason: string;
  ollamaPull: string | null;
  apiModelId: string | null;
  canServeViaApi: boolean;
};

const LOCAL_BYTES = 16 * 1024 ** 3;
const GCP_BYTES = 80 * 1024 ** 3;

export function slugifyModelId(input: string): string {
  return input
    .split("/")
    .pop()!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export function parseWeightSource(raw: string): {
  kind: "huggingface" | "ollama";
  repo: string;
} {
  const trimmed = raw.trim().replace(/^@/, "");
  if (!trimmed) throw new Error("Paste a Hugging Face repo, URL, or Ollama tag.");

  const hfUrl = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?huggingface\.co\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/?$/i
  );
  if (hfUrl) return { kind: "huggingface", repo: hfUrl[1] };

  const hfCo = trimmed.match(/^hf\.co\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/i);
  if (hfCo) return { kind: "huggingface", repo: hfCo[1] };

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return { kind: "huggingface", repo: trimmed };
  }

  if (/^[a-z0-9._-]+(?::[a-z0-9._-]+)?$/i.test(trimmed)) {
    return { kind: "ollama", repo: trimmed };
  }

  throw new Error(
    "Use org/repo (Qwen/Qwen2.5-7B-Instruct), a huggingface.co URL, or an Ollama tag (qwen2.5:7b)."
  );
}

function originForRepo(repo: string): string {
  const org = repo.split("/")[0]?.toLowerCase() || "";
  if (["qwen", "deepseek-ai", "thudm", "moonshotai", "01-ai"].includes(org)) return "cn";
  if (["meta-llama", "google", "openai"].includes(org)) return "us";
  if (["mistralai"].includes(org)) return "eu";
  return "global";
}

function parseParamHint(text: string): { label: string; activeB: number | null; totalB: number | null } | null {
  const moe = text.match(/(\d+(?:\.\d+)?)T-A(\d+(?:\.\d+)?)B/i);
  if (moe) {
    return {
      label: `${moe[1]}T total · ${moe[2]}B active`,
      activeB: Number(moe[2]),
      totalB: Number(moe[1]) * 1000,
    };
  }
  const t = text.match(/(\d+(?:\.\d+)?)T/i);
  if (t && !/token/i.test(text)) {
    return { label: `${t[1]}T`, activeB: Number(t[1]) * 1000, totalB: Number(t[1]) * 1000 };
  }
  const b = text.match(/(\d+(?:\.\d+)?)B/i);
  if (b) {
    return { label: `${b[1]}B`, activeB: Number(b[1]), totalB: Number(b[1]) };
  }
  return null;
}

function classify(opts: {
  estimatedBytes: number | null;
  activeB: number | null;
  totalB: number | null;
  kind: "huggingface" | "ollama";
}): { recommended: ImportTarget; reason: string } {
  if (opts.kind === "ollama") {
    return {
      recommended: "local",
      reason: "Ollama tags pull onto this Mac and become callable through the gateway.",
    };
  }
  const bytes = opts.estimatedBytes;
  const active = opts.activeB;
  const total = opts.totalB;
  if ((total && total >= 200) || (active && active >= 70) || (bytes && bytes > GCP_BYTES)) {
    return {
      recommended: "reserved",
      reason:
        "This checkpoint is too large for a laptop or a single Cloud Run L4. List it, serve the hosted API id if a Qwen key is set, or request reserved GPU capacity.",
    };
  }
  if ((active && active <= 14) || (bytes != null && bytes <= LOCAL_BYTES)) {
    return {
      recommended: "local",
      reason: "Fits this Mac. We will `ollama pull` the weights and expose them on the OpenDoor API.",
    };
  }
  return {
    recommended: "gcp",
    reason: "Too large for a laptop, small enough for a dedicated GPU. We will download the Hugging Face repo onto Cloud Run + vLLM.",
  };
}

function qwenApiId(repo: string, modelId: string): string | null {
  const blob = `${repo} ${modelId}`.toLowerCase();
  if (blob.includes("qwen3.8") || blob.includes("qwen3-8") || blob.includes("qwen3p8")) {
    return "qwen3.8-max";
  }
  return null;
}

export async function planWeightImport(raw: string): Promise<ImportPlan> {
  const parsed = parseWeightSource(raw);
  const canServeViaApi = Boolean(process.env.QWEN_API_KEY);

  if (parsed.kind === "ollama") {
    const modelId = parsed.repo.replace(/[:/]/g, "-").slice(0, 100);
    return {
      source: raw.trim(),
      kind: "ollama",
      repo: parsed.repo,
      modelId,
      displayName: `Ollama ${parsed.repo}`,
      origin: "global",
      gated: false,
      downloads: null,
      parameterHint: null,
      estimatedBytes: null,
      recommended: "local",
      reason: "Ollama tags pull onto this Mac and become callable through the gateway.",
      ollamaPull: parsed.repo,
      apiModelId: qwenApiId(parsed.repo, modelId),
      canServeViaApi,
    };
  }

  const repo = parsed.repo;
  const modelId = slugifyModelId(repo);
  const displayName = repo.split("/").pop()!.replace(/-/g, " ");
  const hint = parseParamHint(repo);
  let gated = false;
  let downloads: number | null = null;
  let estimatedBytes: number | null = null;
  let parameterHint = hint?.label ?? null;

  try {
    const res = await fetch(`https://huggingface.co/api/models/${encodeURIComponent(repo)}`, {
      headers: { Accept: "application/json", "User-Agent": "OpenDoor-import/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) gated = true;
    if (res.ok) {
      const data = (await res.json()) as {
        downloads?: number;
        gated?: boolean;
        safetensors?: { total?: number; parameters?: number };
        siblings?: Array<{ size?: number }>;
      };
      gated = Boolean(data.gated) || gated;
      downloads = typeof data.downloads === "number" ? data.downloads : null;
      if (typeof data.safetensors?.total === "number") {
        estimatedBytes = data.safetensors.total;
      } else if (data.siblings?.length) {
        estimatedBytes = data.siblings.reduce((sum, s) => sum + (s.size || 0), 0);
      }
      if (!parameterHint && typeof data.safetensors?.parameters === "number") {
        const b = data.safetensors.parameters / 1e9;
        parameterHint = b >= 1000 ? `${(b / 1000).toFixed(1)}T` : `${b.toFixed(1)}B`;
      }
    }
  } catch {
    /* preview still works from the repo name */
  }

  const { recommended, reason } = classify({
    estimatedBytes,
    activeB: hint?.activeB ?? null,
    totalB: hint?.totalB ?? null,
    kind: "huggingface",
  });

  const apiModelId = qwenApiId(repo, modelId);

  return {
    source: raw.trim(),
    kind: "huggingface",
    repo,
    modelId,
    displayName,
    origin: originForRepo(repo),
    gated,
    downloads,
    parameterHint,
    estimatedBytes,
    recommended: apiModelId && canServeViaApi && recommended === "reserved" ? "api" : recommended,
    reason:
      apiModelId && canServeViaApi && recommended === "reserved"
        ? `Too large to download onto self-serve GPUs. QWEN_API_KEY is set — we will list ${apiModelId} and route calls to DashScope.`
        : reason,
    ollamaPull: recommended === "local" ? `hf.co/${repo}` : null,
    apiModelId,
    canServeViaApi,
  };
}

export function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return "unknown size";
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(1)} TB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${n} B`;
}
