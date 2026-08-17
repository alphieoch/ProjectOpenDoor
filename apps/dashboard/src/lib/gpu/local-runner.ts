import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { OLLAMA_HOST, isOllamaRunning, listOllamaModels } from "./detect";
import { resolveOllamaTag } from "./models";

const execFileAsync = promisify(execFile);

export interface LocalGpuResult {
  fqdn: string;
  runtimeModel: string;
  localRuntime: "ollama";
  gpuType: "metal";
}

async function ensureOllamaServing(): Promise<void> {
  if (await isOllamaRunning()) return;

  spawn("ollama", ["serve"], {
    detached: true,
    stdio: "ignore",
  }).unref();

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isOllamaRunning()) return;
  }
  throw new Error("Ollama did not start on 127.0.0.1:11434. Run `brew services start ollama`.");
}

export async function startLocalGpuModel(opts: {
  modelId: string;
  ollamaTag?: string | null;
}): Promise<LocalGpuResult> {
  const runtimeModel = resolveOllamaTag(opts.modelId, opts.ollamaTag);
  await ensureOllamaServing();

  const installed = await listOllamaModels();
  const already = installed.some(
    (name) => name === runtimeModel || name.startsWith(`${runtimeModel}:`) || name.startsWith(`${runtimeModel.split(":")[0]}:`)
  );

  if (!already) {
    await execFileAsync("ollama", ["pull", runtimeModel], {
      timeout: 30 * 60 * 1000,
    });
  }

  // Warm the model so the first playground request is not a cold load.
  try {
    await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: runtimeModel, prompt: "ok", stream: false }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    // Pull succeeded; first chat request will load weights.
  }

  return {
    fqdn: OLLAMA_HOST,
    runtimeModel,
    localRuntime: "ollama",
    gpuType: "metal",
  };
}

export async function stopLocalGpuModel(runtimeModel: string | null | undefined): Promise<void> {
  if (!runtimeModel) return;
  try {
    await execFileAsync("ollama", ["stop", runtimeModel], { timeout: 15_000 });
  } catch {
    /* model may already be unloaded */
  }
}
