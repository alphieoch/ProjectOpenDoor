import type { ReactNode } from "react";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  deltaUp = true,
  icon,
  series,
  className,
  featured,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  icon?: ReactNode;
  series?: number[];
  className?: string;
  featured?: boolean;
}) {
  return (
    <div
      className={cn("od-numberblock od-lift", className)}
      style={
        featured
          ? { background: "linear-gradient(160deg, #16140f 0%, #1A73E8 118%)", border: "none", color: "white" }
          : undefined
      }
    >
      <div
        className="od-numberblock__label"
        style={featured ? { color: "rgba(255,255,255,0.62)" } : undefined}
      >
        {icon} {label}
      </div>
      <div className="od-display" style={{ fontSize: 36, marginTop: 8, ...(featured ? { color: "white" } : {}) }}>
        {value}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
        {delta ? (
          <div
            className={deltaUp ? "od-numberblock__delta-up" : "od-numberblock__delta-down"}
            style={featured ? { color: "#8EF0C8" } : undefined}
          >
            {deltaUp ? "↑" : "↓"} {delta}
          </div>
        ) : (
          <span />
        )}
        {series && series.length > 0 ? (
          <Sparkline values={series} color={featured ? "#8EF0C8" : "var(--md-primary)"} />
        ) : null}
      </div>
    </div>
  );
}
