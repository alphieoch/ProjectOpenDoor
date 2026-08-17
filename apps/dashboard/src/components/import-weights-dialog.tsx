"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, Cpu, Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Plan = {
  source: string;
  kind: "huggingface" | "ollama";
  repo: string;
  modelId: string;
  displayName: string;
  gated: boolean;
  parameterHint: string | null;
  recommended: "local" | "gcp" | "api" | "reserved";
  reason: string;
  ollamaPull: string | null;
  apiModelId: string | null;
  canServeViaApi: boolean;
};

type ImportTarget = "local" | "gcp";

const TARGET_LABEL: Record<Plan["recommended"], string> = {
  local: "Recommended: your dedicated metals",
  gcp: "Recommended: Ochieng & Co cloud services",
  api: "Serve through Ochieng & Co cloud services",
  reserved: "List only — needs reserved GPU",
};

function pickInitialTarget(
  plan: Plan,
  preferred?: ImportTarget,
  metalsAvailable = true
): ImportTarget | null {
  if (plan.recommended === "api" || plan.recommended === "reserved") return null;
  if (preferred === "local" && !metalsAvailable) return "gcp";
  if (preferred) return preferred;
  if (plan.recommended === "local" && !metalsAvailable) return "gcp";
  return plan.recommended === "gcp" ? "gcp" : "local";
}

export function ImportWeightsDialog({
  onImported,
  defaultTarget,
  metalsAvailable = true,
  metalsReason,
}: {
  onImported?: () => void;
  defaultTarget?: ImportTarget;
  metalsAvailable?: boolean;
  metalsReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [target, setTarget] = useState<ImportTarget | null>(defaultTarget ?? null);
  const [sizeLabel, setSizeLabel] = useState<string | null>(null);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "list" | "run" | null>(null);

  function applyPlan(next: Plan) {
    setPlan(next);
    setTarget((current) => {
      const suggested = pickInitialTarget(next, defaultTarget, metalsAvailable);
      if (!suggested) return null;
      if (current === "local" && !metalsAvailable) return "gcp";
      if (current === "local" || current === "gcp") return current;
      return suggested;
    });
  }

  async function preview(e: React.FormEvent) {
    e.preventDefault();
    setBusy("preview");
    setError(null);
    setPlan(null);
    setCatalogId(null);
    const res = await fetch("/api/models/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ source, action: "preview" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not resolve that model");
      setBusy(null);
      return;
    }
    applyPlan(data.plan);
    setSizeLabel(data.sizeLabel);
    setBusy(null);
  }

  async function listWeights() {
    if (!source) return;
    setBusy("list");
    setError(null);
    const res = await fetch("/api/models/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ source, action: "list" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to add to catalog");
      setBusy(null);
      return;
    }
    applyPlan(data.plan);
    setSizeLabel(data.sizeLabel);
    setCatalogId(data.catalog?.id || null);
    setBusy(null);
    onImported?.();
  }

  async function downloadAndRun() {
    setBusy("run");
    setError(null);
    let id = catalogId;
    let nextPlan = plan;
    if (!id) {
      const listed = await fetch("/api/models/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ source, action: "list" }),
      });
      const data = await listed.json();
      if (!listed.ok) {
        setError(data.error || "Failed to add to catalog");
        setBusy(null);
        return;
      }
      id = data.catalog?.id;
      nextPlan = data.plan;
      setPlan(data.plan);
    }
    const chosen =
      target === "local" && metalsAvailable
        ? "local"
        : "gcp";
    const res = await fetch("/api/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: nextPlan?.displayName || "Imported model",
        sourceType: id ? "catalog" : "huggingface",
        sourceValue: id || nextPlan?.repo,
        target: chosen,
        gpuRequested: true,
        weightsUri: nextPlan?.kind === "huggingface" ? nextPlan.repo : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to start download");
      setBusy(null);
      return;
    }
    setOpen(false);
    router.push("/dashboard/deployments");
  }

  const canChooseMachine = Boolean(plan && (plan.recommended === "local" || plan.recommended === "gcp"));
  const canRun =
    canChooseMachine &&
    (target === "gcp" || (target === "local" && metalsAvailable));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPlan(null);
          setTarget(defaultTarget ?? null);
          setCatalogId(null);
          setError(null);
          setBusy(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="btn-secondary">
          <Download className="h-4 w-4" />
          Import weights
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Import open weights</DialogTitle>
        </DialogHeader>
        <form onSubmit={preview} className="flex flex-col gap-4 px-1 pb-4">
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>
            Paste a Hugging Face repo or Ollama tag. Preview it, then choose native Ochieng & Co cloud services or your dedicated metals.
          </p>
          <input
            className="input w-full"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Qwen/Qwen2.5-7B-Instruct or qwen2.5:7b"
            required
          />
          <button type="submit" className="btn-secondary self-start" disabled={busy === "preview"}>
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Preview
          </button>

          {error ? (
            <div className="alert-error text-sm" role="alert">
              {error}
            </div>
          ) : null}

          {plan ? (
            <div className="card p-4 text-sm space-y-3">
              <div>
                <div className="font-medium" style={{ color: "var(--ink)" }}>
                  {plan.displayName}
                </div>
                <div className="od-mono text-xs" style={{ color: "var(--ink-4)" }}>
                  {plan.repo}
                  {plan.parameterHint ? ` · ${plan.parameterHint}` : ""}
                  {sizeLabel ? ` · ${sizeLabel}` : ""}
                  {plan.gated ? " · gated" : ""}
                </div>
              </div>
              <div>
                <span className="od-tag od-tag-brand">{TARGET_LABEL[plan.recommended]}</span>
              </div>
              <p style={{ color: "var(--ink-3)" }}>{plan.reason}</p>
              {plan.apiModelId ? (
                <p style={{ color: "var(--ink-3)" }}>
                  Hosted id: <code>{plan.apiModelId}</code>
                  {plan.canServeViaApi ? " — callable now if your key is set." : " — set QWEN_API_KEY to serve without downloading."}
                </p>
              ) : null}

              {canChooseMachine ? (
                <div>
                  <div className="od-eyebrow">Where should weights land?</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="od-model-card"
                      data-active={target === "gcp"}
                      onClick={() => setTarget("gcp")}
                      style={{ padding: 12 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Cloud className="h-3.5 w-3.5" />
                        <span style={{ fontWeight: 600, fontSize: 13 }}>Ochieng & Co cloud services</span>
                      </div>
                      <p style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45, color: "var(--ink-3)", textAlign: "left" }}>
                        Native path. Prepaid credit. Always a valid option.
                      </p>
                    </button>
                    <button
                      type="button"
                      className="od-model-card"
                      data-active={target === "local"}
                      disabled={!metalsAvailable}
                      onClick={() => {
                        if (!metalsAvailable) return;
                        setTarget("local");
                      }}
                      style={{ padding: 12, opacity: metalsAvailable ? 1 : 0.55, cursor: metalsAvailable ? "pointer" : "not-allowed" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Cpu className="h-3.5 w-3.5" />
                        <span style={{ fontWeight: 600, fontSize: 13 }}>Your dedicated metals</span>
                      </div>
                      <p style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45, color: "var(--ink-3)", textAlign: "left" }}>
                        {metalsAvailable
                          ? "Your Metal or GPU. $0. Stays on this machine while capacity remains."
                          : metalsReason || "Not enough dedicated capacity. This is not a valid option."}
                      </p>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={!plan || busy !== null}
              onClick={() => void listWeights()}
            >
              {busy === "list" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add to catalog
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canRun || busy !== null}
              onClick={() => void downloadAndRun()}
            >
              {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {target === "local" ? "Download on your metals" : "Download through Ochieng & Co cloud"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
