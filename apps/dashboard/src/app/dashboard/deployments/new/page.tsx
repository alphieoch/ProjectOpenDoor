"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Server, Box } from "lucide-react";

interface CatalogItem {
  id: string;
  modelId: string;
  displayName: string;
  description: string | null;
  defaultCpu: string;
  defaultMemoryGb: string;
}

const COMPUTE_TIERS = [
  { label: "Small", cpu: "0.5", memoryGb: "1.0", description: "Good for testing" },
  { label: "Medium", cpu: "1.0", memoryGb: "2.0", description: "Balanced performance" },
  { label: "Large", cpu: "2.0", memoryGb: "4.0", description: "Maximum throughput" },
];

export default function NewDeploymentPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"catalog" | "image">("catalog");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [selectedCatalogModel, setSelectedCatalogModel] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [tierIndex, setTierIndex] = useState(1);
  const [replicas, setReplicas] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchCatalog() {
      const res = await fetch("/api/model-catalog");
      if (res.ok) {
        const data = await res.json();
        setCatalog(data.catalog);
        if (data.catalog.length > 0) {
          setSelectedCatalogModel(data.catalog[0].id);
        }
      }
      setLoadingCatalog(false);
    }
    fetchCatalog();
  }, []);

  const tier = COMPUTE_TIERS[tierIndex];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const sourceType = tab;
    const sourceValue = tab === "catalog" ? selectedCatalogModel : imageUrl;

    const res = await fetch("/api/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || (tab === "catalog" ? "My Model" : "Custom Image"),
        sourceType,
        sourceValue,
        cpu: tier.cpu,
        memoryGb: tier.memoryGb,
        replicas,
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
      <h1 className="text-2xl font-bold text-gray-900">New Deployment</h1>
      <p className="mt-1 text-gray-600">
        Deploy a self-hosted model container
      </p>

      <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Deployment name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-llm-deployment"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        {/* Source tabs */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Model source
          </label>
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

        {/* Catalog selection */}
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
                      <p className="font-medium text-gray-900">
                        {item.displayName}
                      </p>
                      {item.description && (
                        <p className="text-sm text-gray-500">
                          {item.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        Default: {item.defaultCpu} CPU / {item.defaultMemoryGb} GB
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Image URL */}
        {tab === "image" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Container image URL
            </label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="ghcr.io/username/my-model:latest"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required={tab === "image"}
            />
            <p className="mt-1 text-xs text-gray-500">
              Image must expose an OpenAI-compatible API on port 8000.
            </p>
          </div>
        )}

        {/* Compute tier */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Compute tier
          </label>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {COMPUTE_TIERS.map((t, i) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setTierIndex(i)}
                className={`rounded-lg border p-4 text-left ${
                  tierIndex === i
                    ? "border-primary-600 bg-primary-50"
                    : "border-gray-200 hover:bg-gray-50"
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

        {/* Replicas */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Replicas: {replicas}
          </label>
          <input
            type="range"
            min={1}
            max={5}
            value={replicas}
            onChange={(e) => setReplicas(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Deployment
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
