import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface GcpGpuResult {
  fqdn: string;
  gcpResourceId: string;
  runtimeModel: string;
  gpuType: string;
}

function projectId(): string {
  const id = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!id) {
    throw new Error("GCP_PROJECT_ID is not set. Add it to .env or run `gcloud config set project`.");
  }
  return id;
}

function region(): string {
  return process.env.GCP_REGION || "us-central1";
}

function gpuType(): string {
  return process.env.GCP_GPU_TYPE || "nvidia-l4";
}

export async function deployGpuToGcp(opts: {
  deploymentId: string;
  name: string;
  huggingFaceRepo: string;
  minReplicas?: number;
  maxReplicas?: number;
  scaleToZero?: boolean;
  precision?: string;
  gpuType?: string;
}): Promise<GcpGpuResult> {
  const service = `opendoor-${opts.deploymentId.replace(/-/g, "").slice(0, 18)}`.toLowerCase();
  const image = process.env.GCP_VLLM_IMAGE || "vllm/vllm-openai:latest";
  const model = opts.huggingFaceRepo;
  const resolvedGpu = opts.gpuType || gpuType();
  const minInstances =
    opts.scaleToZero === false
      ? Math.max(1, opts.minReplicas ?? 1)
      : Math.max(0, opts.minReplicas ?? 0);
  const maxInstances = Math.max(minInstances || 1, opts.maxReplicas ?? 1);
  const dtype = opts.precision || "float16";
  const hfToken = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN || "";
  const envVars = [
    `MODEL_ID=${model}`,
    "HF_HOME=/tmp/huggingface",
    `DTYPE=${dtype}`,
  ];
  if (hfToken) envVars.push(`HUGGING_FACE_HUB_TOKEN=${hfToken}`, `HF_TOKEN=${hfToken}`);
  const args = [
    "run",
    "deploy",
    service,
    `--image=${image}`,
    `--project=${projectId()}`,
    `--region=${region()}`,
    "--gpu=1",
    `--gpu-type=${resolvedGpu}`,
    "--cpu=4",
    "--memory=16Gi",
    "--no-cpu-throttling",
    "--timeout=3600",
    "--port=8000",
    "--allow-unauthenticated",
    `--min-instances=${minInstances}`,
    `--max-instances=${maxInstances}`,
    `--set-env-vars=${envVars.join(",")}`,
    "--command=python",
    "--args=-m,vllm.entrypoints.openai.api_server,--model," +
      model +
      ",--port,8000,--download-dir,/tmp/huggingface,--dtype," +
      dtype,
    "--quiet",
  ];

  try {
    await execFileAsync("gcloud", args, { timeout: 20 * 60 * 1000 });
  } catch (error: any) {
    const detail = [error?.stderr, error?.stdout, error?.message].filter(Boolean).join("\n");
    throw new Error(
      `GCP GPU deploy failed for ${service}. Enable Cloud Run + GPU quota in ${region()}, or run locally on this Mac instead.\n${detail.slice(0, 1500)}`
    );
  }

  const { stdout } = await execFileAsync("gcloud", [
    "run",
    "services",
    "describe",
    service,
    `--project=${projectId()}`,
    `--region=${region()}`,
    "--format=value(status.url)",
  ]);

  const fqdn = stdout.trim();
  if (!fqdn) {
    throw new Error("Cloud Run service created but URL was empty");
  }

  return {
    fqdn,
    gcpResourceId: `projects/${projectId()}/locations/${region()}/services/${service}`,
    runtimeModel: "default",
    gpuType: resolvedGpu,
  };
}

export async function deleteGcpGpuService(gcpResourceId: string | null | undefined): Promise<void> {
  if (!gcpResourceId) return;
  const parts = gcpResourceId.split("/");
  const service = parts[parts.indexOf("services") + 1];
  if (!service) return;
  try {
    await execFileAsync("gcloud", [
      "run",
      "services",
      "delete",
      service,
      `--project=${projectId()}`,
      `--region=${region()}`,
      "--quiet",
    ], { timeout: 180_000 });
  } catch {
    /* already gone */
  }
}
