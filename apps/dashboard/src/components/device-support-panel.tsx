"use client";

import { useState } from "react";
import Link from "next/link";
import { Cpu, Loader2 } from "lucide-react";
import { DeviceInventoryConsent } from "@/components/device-inventory-consent";

type SupportPayload = {
  support: {
    verdict: "installed" | "supported" | "tight" | "unsupported" | "api_only";
    title: string;
    detail: string;
    local: boolean;
    hosted: boolean;
    installed: boolean;
    minMemoryGb: number;
    usableMemoryGb: number | null;
    deviceLabel: string;
    ollamaTag: string | null;
  };
};

const VERDICT_CLASS: Record<SupportPayload["support"]["verdict"], string> = {
  installed: "od-tag od-tag-green",
  supported: "od-tag od-tag-green",
  tight: "od-tag od-tag-neutral",
  unsupported: "od-tag od-tag-neutral",
  api_only: "od-tag od-tag-neutral",
};

const VERDICT_LABEL: Record<SupportPayload["support"]["verdict"], string> = {
  installed: "On this device",
  supported: "Supported",
  tight: "Tight fit",
  unsupported: "Not supported",
  api_only: "API only",
};

export function DeviceSupportPanel({ modelId }: { modelId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SupportPayload | null>(null);
  const [consentGranted, setConsentGranted] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);

  async function check() {
    setOpen(true);
    if (data && !error) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/devices/support?modelId=${encodeURIComponent(modelId)}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (res.status === 403 && json.error === "device_inventory_consent_required") {
        setNeedsConsent(true);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Could not check this device");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check this device");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="od-eyebrow">This device</div>
      {needsConsent && !consentGranted ? (
        <div className="mt-3">
          <DeviceInventoryConsent
            onChange={(granted) => {
              setConsentGranted(granted);
              if (granted) {
                setNeedsConsent(false);
                setOpen(false);
                setData(null);
              }
            }}
          />
        </div>
      ) : !open ? (
        <button type="button" className="btn-secondary mt-3 w-full" onClick={() => void check()}>
          <Cpu className="h-4 w-4" />
          Does my device support this?
        </button>
      ) : (
        <div className="mt-3 rounded-[10px] border p-3" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
          {loading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-3)" }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking Devices…
            </div>
          ) : error ? (
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>{error}</p>
          ) : data ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={VERDICT_CLASS[data.support.verdict]}>{VERDICT_LABEL[data.support.verdict]}</span>
                <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{data.support.deviceLabel}</span>
              </div>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-2)" }}>
                {data.support.title}. {data.support.detail}
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--ink-4)" }}>
                Needs ~{data.support.minMemoryGb} GB
                {data.support.usableMemoryGb != null ? ` · this device has ${data.support.usableMemoryGb} GB` : ""}
                {data.support.ollamaTag ? ` · Ollama ${data.support.ollamaTag}` : ""}.
              </p>
            </>
          ) : null}
          <Link href="/dashboard/devices" className="mt-3 inline-block text-xs underline" style={{ color: "var(--ink-3)" }}>
            Open Devices
          </Link>
        </div>
      )}
    </div>
  );
}
