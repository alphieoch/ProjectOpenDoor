"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cpu, Cloud, Loader2, HardDrive } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DeviceInventoryConsent } from "@/components/device-inventory-consent";

type GpuStatus = {
  local: {
    platform: string;
    appleSilicon: boolean;
    ollamaInstalled: boolean;
    ollamaRunning: boolean;
    ollamaHost: string;
    models: string[];
    hardware: {
      chip: string | null;
      memoryGb: number | null;
      gpuName: string | null;
      gpuMemoryGb: number | null;
      usableMemoryGb: number | null;
    };
  };
  gcp: {
    authenticated: boolean;
    account: string | null;
    project: string | null;
    region: string;
    runApiLikely: boolean;
  };
};

export default function DevicesPage() {
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentGranted, setConsentGranted] = useState(false);
  const [consentReady, setConsentReady] = useState(false);

  useEffect(() => {
    if (!consentGranted) {
      setStatus(null);
      return;
    }
    fetch("/api/gpu/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to read this device"))))
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to read this device"));
  }, [consentGranted]);

  const hw = status?.local.hardware;

  return (
    <div className="od-page">
      <PageHeader
        eyebrow="Hardware"
        title="Devices"
        description="Ochieng & Co cloud services, plus this machine only after you allow a device read."
        actions={
          <Link href="/dashboard/models" className="btn-secondary">
            Browse models
          </Link>
        }
      />

      <div className="od-card mb-6" style={{ padding: "18px 22px" }}>
        <div className="od-eyebrow">Permission</div>
        <p className="mt-2 mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
          We do not inventory this machine until you allow it.
        </p>
        <DeviceInventoryConsent
          onChange={(granted) => {
            setConsentGranted(granted);
            setConsentReady(true);
            if (!granted) setError(null);
          }}
        />
      </div>

      {error && (
        <div className="alert-error mb-4" role="alert">
          {error}
        </div>
      )}

      {!consentReady ? (
        <div className="flex h-24 items-center justify-center gap-2" style={{ color: "var(--ink-3)" }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Checking permission…</span>
        </div>
      ) : !consentGranted ? (
        <div className="od-card" style={{ padding: 40, textAlign: "center", color: "var(--ink-4)" }}>
          Dedicated metals stay hidden until you allow a device read. Ochieng & Co cloud services do not need it.
        </div>
      ) : !status ? (
        <div className="flex h-48 items-center justify-center gap-2" style={{ color: "var(--ink-3)" }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Reading this device…</span>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-6">
            <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
              <Cpu className="h-4 w-4" />
              <p className="text-sm font-medium">This Mac</p>
            </div>
            <p className="mt-3 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
              {hw?.chip || (status.local.appleSilicon ? "Apple Silicon" : status.local.platform)}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--ink-4)" }}>Accelerator</dt>
                <dd style={{ color: "var(--ink-2)" }}>
                  {status.local.appleSilicon ? "Apple Silicon · Metal" : hw?.gpuName || "CPU only"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--ink-4)" }}>Usable memory</dt>
                <dd style={{ color: "var(--ink-2)" }}>
                  {hw?.usableMemoryGb != null ? `${hw.usableMemoryGb} GB` : "—"}
                  {status.local.appleSilicon ? " unified" : hw?.gpuMemoryGb != null ? " VRAM" : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--ink-4)" }}>Ollama</dt>
                <dd style={{ color: "var(--ink-2)" }}>
                  {!status.local.ollamaInstalled
                    ? "Not installed"
                    : status.local.ollamaRunning
                      ? "Running"
                      : "Installed, not running"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--ink-4)" }}>Host</dt>
                <dd className="od-mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
                  {status.local.ollamaHost}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
              <Cloud className="h-4 w-4" />
              <p className="text-sm font-medium">Ochieng & Co cloud services</p>
            </div>
            <p className="mt-3 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
              Native
            </p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-3)" }}>
              Models can run native through Ochieng & Co cloud services. Location is not shown here.
            </p>
          </div>

          <div className="card p-6 lg:col-span-2">
            <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
              <HardDrive className="h-4 w-4" />
              <p className="text-sm font-medium">Weights on this device</p>
            </div>
            {status.local.models.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: "var(--ink-4)" }}>
                No Ollama models detected. Open a model and use “Does my device support this?” to see if it can run here.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {status.local.models.map((name) => (
                  <span key={name} className="od-tag od-tag-neutral od-mono" style={{ fontSize: 11 }}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
