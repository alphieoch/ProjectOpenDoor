"use client";

import Link from "next/link";

export type PricingGpu = {
  sku: string;
  displayName: string;
  hourlyUsd: number;
  regionMultiplier: number;
  available: boolean;
  availability: string;
  kind: "local" | "cloud";
};

const GPU_NOTES: Record<string, string> = {
  metal: "Unified memory · Ollama / on-device",
  "nvidia-l4": "24 GB · Cloud Run default for open-weight",
  "nvidia-a100": "80 GB · reserved / on request",
  "nvidia-h100": "80 GB · reserved · region lock 1.5×",
};

function money(n: number) {
  if (n === 0) return "$0";
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function PricingGpuList({
  gpus,
  markupPercent,
  loading,
}: {
  gpus: PricingGpu[];
  markupPercent: number;
  loading?: boolean;
}) {
  const mul = 1 + markupPercent / 100;

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
        <div className="od-eyebrow">Available GPUs</div>
        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>
          What you can run on
        </div>
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45 }}>
          Customer price includes a {markupPercent}% markup on the wholesale GPU-hour.
        </p>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
        {loading ? (
          <div style={{ padding: 24, color: "var(--ink-4)", fontSize: 13 }}>Loading GPUs…</div>
        ) : gpus.length === 0 ? (
          <div style={{ padding: 24, color: "var(--ink-4)", fontSize: 13 }}>
            No GPU SKUs seeded yet.
          </div>
        ) : (
          gpus.map((g) => {
            const customer = g.hourlyUsd * mul;
            return (
              <div
                key={g.sku}
                style={{
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: `1px solid ${g.available ? "color-mix(in srgb, var(--green) 35%, var(--line))" : "var(--line)"}`,
                  background: g.available ? "color-mix(in srgb, var(--green) 6%, var(--paper))" : "var(--paper)",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: g.available ? "var(--green)" : "var(--ink-4)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{g.displayName}</div>
                  <span
                    className="od-tag"
                    style={{
                      marginLeft: "auto",
                      background: g.available ? "var(--green-soft)" : "var(--paper-3)",
                      color: g.available ? "var(--green)" : "var(--ink-3)",
                    }}
                  >
                    {g.available ? "Available" : "On request"}
                  </span>
                </div>
                <div className="od-mono" style={{ marginTop: 8, fontSize: 11, color: "var(--ink-4)" }}>
                  {g.sku} · {g.kind === "local" ? "on-device" : "Google Cloud"}
                  {GPU_NOTES[g.sku] ? ` · ${GPU_NOTES[g.sku]}` : ""}
                </div>
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Wholesale</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-2)" }}>{money(g.hourlyUsd)}/hr</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Customer</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{money(customer)}/hr</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>
                  {g.availability}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
        Cloud GPUs bill per second.{" "}
        <Link href="/dashboard/deployments/new" style={{ color: "var(--brand)", fontWeight: 500 }}>
          Request GPU
        </Link>
      </div>
    </aside>
  );
}
