import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

export interface DeviceHardware {
  chip: string | null;
  memoryGb: number | null;
  gpuName: string | null;
  gpuMemoryGb: number | null;
  usableMemoryGb: number | null;
}

export interface GpuStatus {
  local: {
    platform: string;
    appleSilicon: boolean;
    ollamaInstalled: boolean;
    ollamaRunning: boolean;
    ollamaHost: string;
    models: string[];
    hardware: DeviceHardware;
  };
  gcp: {
    authenticated: boolean;
    account: string | null;
    project: string | null;
    region: string;
    runApiLikely: boolean;
  };
}

async function commandExists(bin: string): Promise<boolean> {
  try {
    await execFileAsync("which", [bin]);
    return true;
  } catch {
    return false;
  }
}

export async function listOllamaModels(host = OLLAMA_HOST): Promise<string[]> {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    return (data.models || []).map((m) => m.name).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

export async function isOllamaRunning(host = OLLAMA_HOST): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function sysctl(key: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("sysctl", ["-n", key]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function bytesToGb(bytes: number): number | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return Math.round(bytes / 1024 ** 3);
}

async function detectNvidia(): Promise<{ name: string | null; memoryGb: number | null }> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=name,memory.total",
      "--format=csv,noheader,nounits",
    ]);
    const line = stdout.trim().split("\n")[0] || "";
    const [name, mem] = line.split(",").map((s) => s.trim());
    const memoryGb = mem ? Math.round(Number(mem) / 1024) : null;
    return { name: name || null, memoryGb: Number.isFinite(memoryGb) ? memoryGb : null };
  } catch {
    return { name: null, memoryGb: null };
  }
}

export async function detectHardware(appleSilicon: boolean): Promise<DeviceHardware> {
  if (process.platform === "darwin") {
    const memRaw = await sysctl("hw.memsize");
    const brand = await sysctl("machdep.cpu.brand_string");
    const memoryGb = memRaw ? bytesToGb(Number(memRaw)) : null;
    return {
      chip: brand,
      memoryGb,
      gpuName: appleSilicon ? brand : null,
      gpuMemoryGb: appleSilicon ? memoryGb : null,
      usableMemoryGb: memoryGb,
    };
  }

  const nvidia = await detectNvidia();
  let memoryGb: number | null = null;
  try {
    const { stdout } = await execFileAsync("awk", [
      "/MemTotal/ { print $2; exit }",
      "/proc/meminfo",
    ]);
    const kb = Number(stdout.trim());
    if (Number.isFinite(kb) && kb > 0) memoryGb = Math.round(kb / 1024 / 1024);
  } catch {
    /* ignore */
  }

  return {
    chip: nvidia.name,
    memoryGb,
    gpuName: nvidia.name,
    gpuMemoryGb: nvidia.memoryGb,
    usableMemoryGb: nvidia.memoryGb ?? memoryGb,
  };
}

export async function detectGpuStatus(): Promise<GpuStatus> {
  const appleSilicon = process.arch === "arm64" && process.platform === "darwin";
  const ollamaInstalled = await commandExists("ollama");
  const ollamaRunning = await isOllamaRunning();
  const [models, hardware] = await Promise.all([
    ollamaRunning ? listOllamaModels() : Promise.resolve([] as string[]),
    detectHardware(appleSilicon),
  ]);

  let account: string | null = null;
  let project: string | null = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
  let authenticated = false;

  if (await commandExists("gcloud")) {
    try {
      const { stdout } = await execFileAsync("gcloud", [
        "auth",
        "list",
        "--filter=status:ACTIVE",
        "--format=value(account)",
      ]);
      account = stdout.trim().split("\n")[0] || null;
      authenticated = Boolean(account);
    } catch {
      authenticated = false;
    }
    if (!project) {
      try {
        const { stdout } = await execFileAsync("gcloud", ["config", "get-value", "project"]);
        const value = stdout.trim();
        if (value && value !== "(unset)") project = value;
      } catch {
        /* ignore */
      }
    }
  }

  return {
    local: {
      platform: `${process.platform}/${process.arch}`,
      appleSilicon,
      ollamaInstalled,
      ollamaRunning,
      ollamaHost: OLLAMA_HOST,
      models,
      hardware,
    },
    gcp: {
      authenticated,
      account,
      project,
      region: process.env.GCP_REGION || "us-central1",
      runApiLikely: authenticated && Boolean(project),
    },
  };
}
