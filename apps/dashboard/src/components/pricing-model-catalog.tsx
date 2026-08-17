"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ModelMark } from "@/components/ui/model-mark";

type CatalogRow = {
  id: string;
  label: string;
  provider: string;
  family?: string;
  status?: string;
  modality?: string;
  pricePer1MInputUsd?: number | null;
  pricePer1MOutputUsd?: number | null;
};

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function PricingModelCatalog({
  selectedModel,
  onSelect,
}: {
  selectedModel: string;
  onSelect: (modelId: string) => void;
}) {
  const [models, setModels] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "chat" | "open">("chat");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models/available", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((data: { models?: CatalogRow[] }) => {
        if (!cancelled) setModels(Array.isArray(data.models) ? data.models : []);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    let next = models;
    if (filter === "chat") next = next.filter((m) => (m.modality || "chat") === "chat");
    if (filter === "open") next = next.filter((m) => m.family === "open_weight");
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
        <div className="od-eyebrow">Model catalog</div>
        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>
          Pick a model to price
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models…"
          style={{
            marginTop: 12,
            width: "100%",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            background: "var(--paper)",
            color: "var(--ink)",
            outline: "none",
          }}
        />
        <div className="od-seg" style={{ marginTop: 10 }}>
          {(["chat", "open", "all"] as const).map((key) => (
            <button
              key={key}
              type="button"
              data-active={filter === key}
              onClick={() => setFilter(key)}
            >
              {key === "chat" ? "Chat" : key === "open" ? "Open weight" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 8 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 160, color: "var(--ink-3)" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading catalog…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
            No models match.
          </div>
        ) : (
          rows.map((m) => {
            const active = selectedModel === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m.id)}
                style={{
                  display: "flex",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 10px",
                  borderRadius: 12,
                  border: `1px solid ${active ? "var(--brand)" : "transparent"}`,
                  background: active ? "var(--brand-soft)" : "transparent",
                  cursor: "pointer",
                  marginBottom: 4,
                }}
                className={active ? "" : "hover:bg-[var(--paper-3)]"}
              >
                <ModelMark name={m.label || m.id} provider={m.provider} modelId={m.id} size={28} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.label}
                    </span>
                    <span className="od-mono" style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: "auto", flexShrink: 0 }}>
                      {money(m.pricePer1MInputUsd)} / {money(m.pricePer1MOutputUsd)}
                    </span>
                  </div>
                  <div className="od-mono" style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>
                    {m.provider} · {m.id}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
        Rates are $ / 1M tokens.{" "}
        <Link href="/dashboard/models" style={{ color: "var(--brand)", fontWeight: 500 }}>
          Open full catalog
        </Link>
      </div>
    </aside>
  );
}
