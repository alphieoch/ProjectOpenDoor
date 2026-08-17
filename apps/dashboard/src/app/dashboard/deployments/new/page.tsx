"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Server, Box, Cpu, Cloud, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GPU_RATES, gcpStartCreditCents } from "@opendoor/shared";

interface CatalogItem {
  id: string;
  modelId: string;
  displayName: string;
  description: string | null;
  defaultCpu: string;
  defaultMemoryGb: string;
  ollamaTag?: string | null;
}

interface GpuStatus {
  local: {
    appleSilicon: boolean;
    ollamaInstalled: boolean;
    ollamaRunning: boolean;
    models: string[];
  };
  gcp: {
    authenticated: boolean;
    account: string | null;
    project: string | null;
    region: string;
  };
}

const COMPUTE_TIERS = [
  { label: "Small", cpu: "0.5", memoryGb: "1.0", description: "Good for testing" },
  { label: "Medium", cpu: "1.0", memoryGb: "2.0", description: "Balanced performance" },
  { label: "Large", cpu: "2.0", memoryGb: "4.0", description: "Maximum throughput" },
];

export default function NewDeploymentPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"catalog" | "huggingface" | "image">("catalog");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null);
  const [creditsUsd, setCreditsUsd] = useState<number | null>(null);
  const [paidCreditsUsd, setPaidCreditsUsd] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [selectedCatalogModel, setSelectedCatalogModel] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [tierIndex, setTierIndex] = useState(1);
  const [replicas, setReplicas] = useState(1);
  const [target, setTarget] = useState<"local" | "gcp">("gcp");
  const [submitting, setSubmitting] = useState(false);
  const [weightsUri, setWeightsUri] = useState("");
  const [precision, setPrecision] = useState("fp16");
  const [scaleToZero, setScaleToZero] = useState(true);
  const [reserved, setReserved] = useState(false);
  const [minReplicas, setMinReplicas] = useState(0);
  const [maxReplicas, setMaxReplicas] = useState(1);

  useEffect(() => {
    async function load() {
      const [catalogRes, consentRes, balanceRes] = await Promise.all([
        fetch("/api/model-catalog"),
        fetch("/api/devices/consent", { credentials: "include" }),
        fetch("/api/billing/balance"),
      ]);
      if (catalogRes.ok) {
        const data = await catalogRes.json();
        setCatalog(data.catalog);
        const localFirst =
          data.catalog.find((item: CatalogItem) => item.modelId === "llama-3.2-3b-instruct") ||
          data.catalog[0];
        if (localFirst) setSelectedCatalogModel(localFirst.id);
      }
      const consentJson = consentRes.ok ? await consentRes.json() : { consent: { granted: false } };
      if (consentJson?.consent?.granted) {
        const gpuRes = await fetch("/api/gpu/status", { credentials: "include" });
        if (gpuRes.ok) setGpuStatus(await gpuRes.json());
      }
      if (balanceRes.ok) {
        const bal = await balanceRes.json();
        setCreditsUsd(Number(bal.creditsUsdCents || 0) / 100);
        setPaidCreditsUsd(Number(bal.paidCreditsUsdCents ?? bal.creditsUsdCents ?? 0) / 100);
      }
      setLoadingCatalog(false);
    }
    load();
  }, []);

  const tier = COMPUTE_TIERS[tierIndex];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const sourceType = tab;
    const sourceValue =
      tab === "catalog" ? selectedCatalogModel : tab === "huggingface" ? weightsUri : imageUrl;

    const res = await fetch("/api/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || (tab === "catalog" ? "Local GPU" : tab === "huggingface" ? "HF weights" : "Custom Image"),
        sourceType,
        sourceValue,
        cpu: tier.cpu,
        memoryGb: tier.memoryGb,
        replicas,
        target,
        gpuRequested: true,
        weightsUri: weightsUri || undefined,
        precision,
        scaleToZero: reserved ? false : scaleToZero,
        reserved,
        minReplicas: reserved ? Math.max(1, minReplicas) : minReplicas,
        maxReplicas,
      }),
    });

    if (res.ok) {
      router.push("/dashboard/deployments");
    } else {
      const err = await res.json();
      alert(err.error || "Failed to create deployment");
    }
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Deployments"
        title="Request GPU"
        description="Run an open model on this Mac (Apple Silicon / Metal) or provision an NVIDIA GPU on GCP."
      />

      {gpuStatus && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="card p-4 text-sm">
            <p className="font-medium" style={{ color: "var(--ink)" }}>Your dedicated metals</p>
            <p style={{ color: "var(--ink-3)" }}>
              {gpuStatus.local.appleSilicon ? "Apple Silicon · Metal" : gpuStatus.local.hardware?.gpuName || "No dedicated metals"}
              {" · "}
              Ollama {gpuStatus.local.ollamaInstalled ? "installed" : "missing"}
              {gpuStatus.local.ollamaRunning ? ", running" : gpuStatus.local.ollamaInstalled ? ", not running" : ""}
            </p>
          </div>
          <div className="card p-4 text-sm">
            <p className="font-medium" style={{ color: "var(--ink)" }}>Ochieng & Co cloud services</p>
            <p style={{ color: "var(--ink-3)" }}>
              Native path. Location is not shown here.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-6">
        <div>
          <label className="block text-sm font-medium" style={{ color: "var(--ink-2)" }}>
            Where should the GPU run?
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTarget("local")}
              className={`rounded-lg border p-4 text-left ${
                target === "local" ? "border-primary-600 bg-primary-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <Cpu className="h-4 w-4" />
              <p className="mt-2 font-medium">This Mac</p>
              <p className="mt-1 text-xs text-gray-500">Ollama on Apple Silicon. $0 — your machine, starts immediately.</p>
            </button>
            <button
              type="button"
              onClick={() => setTarget("gcp")}
              className={`rounded-lg border p-4 text-left ${
                target === "gcp" ? "border-primary-600 bg-primary-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <Cloud className="h-4 w-4" />
              <p className="mt-2 font-medium">GCP Cloud Run GPU</p>
              <p className="mt-1 text-xs text-gray-500">
                NVIDIA L4 at ${GPU_RATES["nvidia-l4"].listHourlyUsd.toFixed(2)}/hr when warm. Scale-to-zero is $0 idle.
              </p>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Deployment name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={target === "local" ? "local-llama" : "gcp-vllm"}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Model source</label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setTab("catalog")}
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
                tab === "catalog"
                  ? "border-primary-600 bg-primary-50 text-primary-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Box className="h-4 w-4" />
              Model Catalog
            </button>
            <button
              type="button"
              onClick={() => setTab("huggingface")}
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
                tab === "huggingface"
                  ? "border-primary-600 bg-primary-50 text-primary-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Download className="h-4 w-4" />
              Hugging Face
            </button>
            <button
              type="button"
              onClick={() => setTab("image")}
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
                tab === "image"
                  ? "border-primary-600 bg-primary-50 text-primary-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Server className="h-4 w-4" />
              Custom Image
            </button>
          </div>
        </div>

        {tab === "catalog" && (
          <div>
            {loadingCatalog ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading catalog...
              </div>
            ) : catalog.length === 0 ? (
              <p className="text-gray-500">No models in catalog yet.</p>
            ) : (
              <div className="space-y-2">
                {catalog.map((item) => (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                      selectedCatalogModel === item.id
                        ? "border-primary-600 bg-primary-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="catalogModel"
                      value={item.id}
                      checked={selectedCatalogModel === item.id}
                      onChange={() => setSelectedCatalogModel(item.id)}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{item.displayName}</p>
                      {item.description && (
                        <p className="text-sm text-gray-500">{item.description}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        {item.ollamaTag ? `Ollama: ${item.ollamaTag}` : `Default: ${item.defaultCpu} CPU / ${item.defaultMemoryGb} GB`}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "huggingface" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Hugging Face repo</label>
            <input
              type="text"
              value={weightsUri}
              onChange={(e) => setWeightsUri(e.target.value)}
              placeholder="Qwen/Qwen2.5-7B-Instruct"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required={tab === "huggingface"}
            />
            <p className="mt-1 text-xs text-gray-500">
              This Mac pulls via Ollama (`hf.co/org/repo`). GCP downloads the repo into vLLM. Frontier MoE checkpoints (1T+) need reserved capacity or a hosted API key.
            </p>
          </div>
        )}

        {tab === "image" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Container image URL</label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="ghcr.io/username/my-model:latest"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required={tab === "image"}
            />
            <p className="mt-1 text-xs text-gray-500">
              Image must expose an OpenAI-compatible API on port 8000. Used for GCP / Azure targets.
            </p>
          </div>
        )}

        {target === "gcp" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700">Compute tier</label>
              <div className="mt-2 grid grid-cols-3 gap-3">
                {COMPUTE_TIERS.map((t, i) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setTierIndex(i)}
                    className={`rounded-lg border p-4 text-left ${
                      tierIndex === i ? "border-primary-600 bg-primary-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <p className="font-medium text-gray-900">{t.label}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {t.cpu} CPU / {t.memoryGb} GB
                    </p>
                    <p className="mt-1 text-xs text-gray-400">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Replicas: {replicas}</label>
              <input
                type="range"
                min={1}
                max={5}
                value={replicas}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setReplicas(n);
                  setMaxReplicas(Math.max(n, maxReplicas));
                }}
                className="mt-1 w-full"
              />
            </div>
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-800">Weights & scaling</p>
              <div>
                <label className="block text-xs text-gray-600">Custom weights (HF repo URI)</label>
                <input
                  type="text"
                  value={weightsUri}
                  onChange={(e) => setWeightsUri(e.target.value)}
                  placeholder="org/model — overrides catalog HF repo"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600">Precision</label>
                <select
                  value={precision}
                  onChange={(e) => setPrecision(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="fp16">fp16</option>
                  <option value="bf16">bf16</option>
                  <option value="fp8">fp8</option>
                  <option value="int4">int4</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-600">
                  Min replicas
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={minReplicas}
                    onChange={(e) => setMinReplicas(Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    disabled={reserved}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Max replicas
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxReplicas}
                    onChange={(e) => setMaxReplicas(Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={scaleToZero && !reserved}
                  disabled={reserved}
                  onChange={(e) => setScaleToZero(e.target.checked)}
                />
                Scale to zero when idle
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={reserved}
                  onChange={(e) => {
                    setReserved(e.target.checked);
                    if (e.target.checked) {
                      setScaleToZero(false);
                      setMinReplicas(Math.max(1, minReplicas));
                    }
                  }}
                />
                Reserved capacity (keep warm — no scale-to-zero)
              </label>
            </div>
          </>
        )}

        {target === "gcp" ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-medium text-slate-950">What this costs</p>
            <p className="mt-1">
              {reserved || !scaleToZero
                ? `Reserved L4: $${GPU_RATES["nvidia-l4"].listHourlyUsd.toFixed(2)}/hr × ${Math.max(1, minReplicas)} replica(s) while it stays up.`
                : `Scale-to-zero: $0 idle, $${GPU_RATES["nvidia-l4"].listHourlyUsd.toFixed(2)}/hr only while a request is being served.`}
            </p>
            <p className="mt-1 text-slate-500">
              Prepaid (not welcome) balance:{" "}
              {paidCreditsUsd == null ? "…" : `$${paidCreditsUsd.toFixed(2)}`}
              {creditsUsd != null && paidCreditsUsd != null && creditsUsd > paidCreditsUsd
                ? ` · $${(creditsUsd - paidCreditsUsd).toFixed(2)} welcome cannot start GCP`
                : ""}
              . Need $
              {(
                (reserved || !scaleToZero
                  ? gcpStartCreditCents(true)
                  : gcpStartCreditCents(false)) / 100
              ).toFixed(0)}{" "}
              prepaid to start. This Mac stays $0 if you want to try first.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">This Mac is $0. We do not bill Metal or Ollama time.</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {target === "local" ? "Start on this Mac" : "Request GCP GPU"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
