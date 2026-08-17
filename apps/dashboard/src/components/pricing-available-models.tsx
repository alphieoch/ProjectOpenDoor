"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ModelMark } from "@/components/ui/model-mark";
import { customerPer1K, formatPriceCombo, type EffortLevel, type SpeedTier } from "@/lib/pricing-markup";
import type { PricingRule } from "@/components/pricing-calculator";

export type PricingAvailableModel = {
  id: string;
  label: string;
  provider: string;
  family: string;
  modality: string;
  status: string;
  available: boolean;
  mine?: boolean;
  gpu: {
    sku: string;
    label: string;
    available: boolean;
    reason: string;
  };
  performance: {
    context: string;
    paramB: number | null;
    tokPerSec: number | null;
    ttftMs: number | null;
    liveLatencyMs: number | null;
    liveRequests: number;
    class: "fast" | "balanced" | "quality";
    vision: boolean;
    tools: boolean;
  };
};

export type PricingGpu = {
  sku: string;
  displayName: string;
  available: boolean;
  availability: string;
};

type Filter = "available" | "all";

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

function statusLabel(m: PricingAvailableModel) {
  if (m.available && (m.performance.liveRequests > 0 || m.mine)) return "Running";
  if (m.available) return "Available";
  return "Unavailable";
}

export function PricingAvailableModels({
  models,
  rules = [],
  speedTier,
  effortLevel,
  selectedModel,
  onSelect,
  loading,
}: {
  models: PricingAvailableModel[];
  rules?: PricingRule[];
  speedTier: SpeedTier;
  effortLevel: EffortLevel;
  gpus?: PricingGpu[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("available");

  const rows = useMemo(() => {
    let next = models;
    if (filter === "available") next = next.filter((m) => m.available);
    const q = query.trim().toLowerCase();
    if (q) {
      next = next.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.label.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q),
      );
    }
    return next;
  }, [models, filter, query]);

  return (
    <aside
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
        <div className="od-eyebrow">Available to you</div>
        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>
          Models you can run
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models…"
          className="input"
          style={{ marginTop: 12, fontSize: 13 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {(
            [
              ["available", "Available"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className="od-tag"
              style={{
                cursor: "pointer",
                border: "none",
                background: filter === id ? "var(--brand-soft)" : "var(--paper-3)",
                color: filter === id ? "var(--brand)" : "var(--ink-3)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
        {loading ? (
          <div style={{ padding: 24, color: "var(--ink-4)", fontSize: 13 }}>Loading models…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, color: "var(--ink-4)", fontSize: 13 }}>
            No models match.
          </div>
        ) : (
          rows.map((m) => {
            const active = selectedModel === m.id;
            const p = m.performance;
            const status = statusLabel(m);
            const rule = rules.find((r) => r.modelId === m.id);
            const regular1m = rule
              ? customerPer1K(parseFloat(rule.inputCostPer1K), "regular") * 1000
              : null;
            const fast1m = rule
              ? customerPer1K(parseFloat(rule.inputCostPer1K), "fast") * 1000
              : null;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 12,
                  marginBottom: 8,
                  borderRadius: 12,
                  border: `1px solid ${
                    active
                      ? "var(--brand)"
                      : m.available
                        ? "color-mix(in srgb, var(--green) 30%, var(--line))"
                        : "var(--line)"
                  }`,
                  background: active
                    ? "color-mix(in srgb, var(--brand) 8%, var(--paper))"
                    : m.available
                      ? "color-mix(in srgb, var(--green) 5%, var(--paper))"
                      : "var(--paper)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <ModelMark name={m.label} provider={m.provider} modelId={m.id} size={28} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: "var(--ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.label}
                      </span>
                      <span
                        className="od-tag"
                        style={{
                          marginLeft: "auto",
                          flexShrink: 0,
                          background: m.available ? "var(--green-soft)" : "var(--paper-3)",
                          color: m.available ? "var(--green)" : "var(--ink-3)",
                        }}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="od-mono" style={{ marginTop: 3, fontSize: 11, color: "var(--ink-4)" }}>
                      {m.provider}
                      {p.paramB ? ` · ${p.paramB}B` : ""}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 6,
                      }}
                    >
                      <Metric
                        label="Regular / 1M"
                        value={regular1m == null ? "—" : money(regular1m)}
                      />
                      <Metric
                        label="Fast / 1M"
                        value={fast1m == null ? "—" : money(fast1m)}
                      />
                      <Metric label="Context" value={p.context} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-3)" }}>
                      {formatPriceCombo(speedTier, effortLevel)}
                      {p.vision ? " · Vision" : ""}
                      {p.tools ? " · Tools" : ""}
                      {p.liveRequests > 0 ? ` · ${p.liveRequests} calls this week` : ""}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
        Regular × Medium is the default. Fast and higher effort are optional.{" "}
        <Link href="/dashboard/models" style={{ color: "var(--brand)", fontWeight: 500 }}>
          Full catalog
        </Link>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
