"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PricingCalculator, { type PricingRule } from "@/components/pricing-calculator";
import {
  PricingAvailableModels,
  type PricingAvailableModel,
} from "@/components/pricing-available-models";
import { PageHeader } from "@/components/ui/page-header";
import type { EffortLevel, SpeedTier } from "@/lib/pricing-markup";

export default function PricingPage() {
  const [selectedModel, setSelectedModel] = useState("");
  const [speedTier, setSpeedTier] = useState<SpeedTier>("regular");
  const [effortLevel, setEffortLevel] = useState<EffortLevel>("medium");
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [models, setModels] = useState<PricingAvailableModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pricing", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const nextRules: PricingRule[] = Array.isArray(data.rules) ? data.rules : [];
        const nextModels: PricingAvailableModel[] = Array.isArray(data.availableModels)
          ? data.availableModels
          : [];
        setRules(nextRules);
        setModels(nextModels);
        if (!selectedModel) {
          const firstReady = nextModels.find((m) => m.available && (m.modality || "chat") === "chat");
          const firstRule = nextRules.find((r) => r.available && (r.modality || "chat") === "chat") || nextRules[0];
          setSelectedModel(firstReady?.id || firstRule?.modelId || "");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRules([]);
          setModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <PageHeader
        compact
        className="shrink-0"
        eyebrow="Commercial"
        title="Pricing calculator"
        description="Estimate monthly spend. Pick a model, Regular or Fast, then Low to Very high effort."
        actions={
          <Link href="/pricing" className="md-btn-outlined">
            Public rates
          </Link>
        }
      />
      <div
        className="grid w-full min-h-0 flex-1 gap-5 lg:grid-cols-2"
        style={{ overflow: "hidden" }}
      >
        <div className="min-h-0 overflow-hidden">
          <PricingCalculator
            rules={rules}
            loading={loading}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            speedTier={speedTier}
            onSpeedTierChange={setSpeedTier}
            effortLevel={effortLevel}
            onEffortLevelChange={setEffortLevel}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <PricingAvailableModels
            models={models}
            rules={rules}
            speedTier={speedTier}
            effortLevel={effortLevel}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
