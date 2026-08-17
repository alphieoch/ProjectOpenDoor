"use client";

import { useMemo, useState } from "react";
import {
  billedOutputTokens,
  customerPer1K,
  EFFORT_LEVELS,
  formatPriceCombo,
  type EffortLevel,
  type SpeedTier,
} from "@/lib/pricing-markup";

export type PricingRule = {
  id: string;
  modelId: string;
  label: string;
  providerName: string;
  providerSlug?: string;
  family: string;
  status: string;
  modality: string;
  available: boolean;
  inputCostPer1K: string;
  outputCostPer1K: string;
};

function money(n: number) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs < 0.01 ? 4 : abs < 1 ? 3 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

function per1M(per1k: number) {
  return per1k * 1000;
}

function estimateFor(
  rule: PricingRule,
  speed: SpeedTier,
  effort: EffortLevel,
  requestsPerDay: number,
  inputTokens: number,
  outputTokens: number,
) {
  const wholesaleIn = parseFloat(rule.inputCostPer1K);
  const wholesaleOut = parseFloat(rule.outputCostPer1K);
  if (!Number.isFinite(wholesaleIn) || !Number.isFinite(wholesaleOut)) return null;
  const customerIn = customerPer1K(wholesaleIn, speed);
  const customerOut = customerPer1K(wholesaleOut, speed);
  const billedOut = billedOutputTokens(outputTokens, effort);
  const daily =
    (inputTokens / 1000) * customerIn * requestsPerDay +
    (billedOut / 1000) * customerOut * requestsPerDay;
  return {
    daily,
    monthly: daily * 30,
    perRequest: daily / requestsPerDay,
    customerIn,
    customerOut,
    billedOut,
  };
}

export default function PricingCalculator({
  rules,
  loading,
  selectedModel,
  onModelChange,
  speedTier,
  onSpeedTierChange,
  effortLevel,
  onEffortLevelChange,
}: {
  rules: PricingRule[];
  loading?: boolean;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  speedTier: SpeedTier;
  onSpeedTierChange: (tier: SpeedTier) => void;
  effortLevel: EffortLevel;
  onEffortLevelChange: (level: EffortLevel) => void;
}) {
  const [requestsPerDay, setRequestsPerDay] = useState(1000);
  const [inputTokens, setInputTokens] = useState(500);
  const [outputTokens, setOutputTokens] = useState(250);

  const selectedRule = useMemo(
    () => rules.find((r) => r.modelId === selectedModel) ?? null,
    [rules, selectedModel],
  );

  const estimate = useMemo(
    () =>
      selectedRule
        ? estimateFor(selectedRule, speedTier, effortLevel, requestsPerDay, inputTokens, outputTokens)
        : null,
    [selectedRule, speedTier, effortLevel, requestsPerDay, inputTokens, outputTokens],
  );
  const otherSpeed = useMemo(
    () =>
      selectedRule
        ? estimateFor(
            selectedRule,
            speedTier === "fast" ? "regular" : "fast",
            effortLevel,
            requestsPerDay,
            inputTokens,
            outputTokens,
          )
        : null,
    [selectedRule, speedTier, effortLevel, requestsPerDay, inputTokens, outputTokens],
  );
  const lowEffort = useMemo(
    () =>
      selectedRule
        ? estimateFor(selectedRule, speedTier, "low", requestsPerDay, inputTokens, outputTokens)
        : null,
    [selectedRule, speedTier, requestsPerDay, inputTokens, outputTokens],
  );
  const veryHighEffort = useMemo(
    () =>
      selectedRule
        ? estimateFor(selectedRule, speedTier, "very_high", requestsPerDay, inputTokens, outputTokens)
        : null,
    [selectedRule, speedTier, requestsPerDay, inputTokens, outputTokens],
  );

  if (loading) {
    return (
      <div className="od-card flex h-full items-center p-6" style={{ color: "var(--ink-4)", fontSize: 13 }}>
        Loading rates…
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="od-card flex h-full items-center p-6" style={{ color: "var(--ink-4)", fontSize: 13 }}>
        No published rates yet. Seed pricing_rules or check the public catalog.
      </div>
    );
  }

  return (
    <div
      className="od-card"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <div className="od-eyebrow">Estimate</div>
        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>
          Monthly token spend
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>Speed</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={() => onSpeedTierChange("regular")}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${speedTier === "regular" ? "var(--brand)" : "var(--line)"}`,
                background:
                  speedTier === "regular"
                    ? "color-mix(in srgb, var(--brand) 8%, var(--paper))"
                    : "var(--paper)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Regular</div>
              <div style={{ marginTop: 2, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.35 }}>
                Cheaper. Fine when the job can wait.
              </div>
            </button>
            <button
              type="button"
              onClick={() => onSpeedTierChange("fast")}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${speedTier === "fast" ? "var(--brand)" : "var(--line)"}`,
                background:
                  speedTier === "fast"
                    ? "color-mix(in srgb, var(--brand) 8%, var(--paper))"
                    : "var(--paper)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Fast</div>
              <div style={{ marginTop: 2, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.35 }}>
                Costs more. Use only when you need it now.
              </div>
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>Effort</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
            {EFFORT_LEVELS.map((level) => {
              const active = effortLevel === level.id;
              return (
                <button
                  key={level.id}
                  type="button"
                  onClick={() => onEffortLevelChange(level.id)}
                  style={{
                    textAlign: "left",
                    padding: "8px 8px",
                    borderRadius: 10,
                    border: `1px solid ${active ? "var(--brand)" : "var(--line)"}`,
                    background: active
                      ? "color-mix(in srgb, var(--brand) 8%, var(--paper))"
                      : "var(--paper)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>{level.label}</div>
                  <div style={{ marginTop: 2, fontSize: 10, color: "var(--ink-3)", lineHeight: 1.3 }}>
                    {level.blurb}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 16px 0", flexShrink: 0 }}>
        <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Model in this estimate
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="input"
            style={{ marginTop: 6, fontSize: 13 }}
          >
            {!selectedModel && <option value="">Select a model</option>}
            {selectedModel && !rules.some((r) => r.modelId === selectedModel) && (
              <option value={selectedModel}>{selectedModel} — no published rate</option>
            )}
            {rules.map((rule) => (
              <option key={rule.id} value={rule.modelId}>
                {rule.label} · {rule.providerName}
              </option>
            ))}
          </select>
        </label>
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--ink-4)" }}>
          Model × speed × effort. Low effort is cheaper. Very high thinks longer and costs more.
        </p>
      </div>

      <div style={{ flex: 1, minHeight: 0 }} />

      <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--line)", flexShrink: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
            Requests / day
            <input
              type="range"
              min={10}
              max={100000}
              step={10}
              value={requestsPerDay}
              onChange={(e) => setRequestsPerDay(Number(e.target.value))}
              className="w-full accent-[var(--brand)]"
            />
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 12 }}>{requestsPerDay.toLocaleString()}</div>
          </label>
          <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
            Input tokens
            <input
              type="range"
              min={10}
              max={8000}
              step={10}
              value={inputTokens}
              onChange={(e) => setInputTokens(Number(e.target.value))}
              className="w-full accent-[var(--brand)]"
            />
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 12 }}>{inputTokens.toLocaleString()}</div>
          </label>
          <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
            Output tokens
            <input
              type="range"
              min={10}
              max={4000}
              step={10}
              value={outputTokens}
              onChange={(e) => setOutputTokens(Number(e.target.value))}
              className="w-full accent-[var(--brand)]"
            />
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 12 }}>{outputTokens.toLocaleString()}</div>
          </label>
        </div>

        {selectedModel && !selectedRule ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
            {selectedModel} is available to run, but it has no published rate yet. Pick a priced model to estimate spend.
          </p>
        ) : null}

        {estimate && selectedRule ? (
          <>
            <div
              style={{
                borderRadius: 12,
                background: "var(--ink)",
                color: "var(--paper-2)",
                padding: "14px 16px",
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
                  {formatPriceCombo(speedTier, effortLevel)} monthly
                </div>
                <div style={{ fontSize: 28, fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                  {money(estimate.monthly)}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12, opacity: 0.8 }}>
                {selectedRule.label}
                <div className="od-mono" style={{ marginTop: 2, fontSize: 11 }}>
                  {money(per1M(estimate.customerIn))} in · {money(per1M(estimate.customerOut))} out / 1M
                  {` · ~${Math.round(estimate.billedOut).toLocaleString()} billed out`}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <div className="od-card" style={{ padding: "8px 10px", boxShadow: "none" }}>
                <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase" }}>
                  {speedTier === "fast" ? "Regular instead" : "Fast instead"}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{otherSpeed ? money(otherSpeed.monthly) : "—"}</div>
              </div>
              <div className="od-card" style={{ padding: "8px 10px", boxShadow: "none" }}>
                <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase" }}>
                  {effortLevel === "low" ? "Very high instead" : "Low effort instead"}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {effortLevel === "low"
                    ? veryHighEffort
                      ? money(veryHighEffort.monthly)
                      : "—"
                    : lowEffort
                      ? money(lowEffort.monthly)
                      : "—"}
                </div>
              </div>
              <div className="od-card" style={{ padding: "8px 10px", boxShadow: "none" }}>
                <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase" }}>Daily</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{money(estimate.daily)}</div>
              </div>
              <div className="od-card" style={{ padding: "8px 10px", boxShadow: "none" }}>
                <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase" }}>Per request</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{money(estimate.perRequest)}</div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
