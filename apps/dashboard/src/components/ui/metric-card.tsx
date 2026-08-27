import type { ReactNode } from "react";
import { Sparkline } from "@/components/ui/sparkline";
import { GlassCard } from "@/components/ui/glass-card";
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
    <GlassCard
      className={cn(
        featured && "bg-primary text-primary-foreground dark:bg-primary border-transparent",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 font-inter text-[11px] font-medium uppercase tracking-[0.12em]",
          featured ? "text-primary-foreground/70" : "text-muted-foreground",
        )}
      >
        {icon} {label}
      </div>
      <div className={cn("mt-2 font-garamond text-4xl tracking-tight", featured ? "text-primary-foreground" : "text-foreground")}>
        {value}
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-2.5">
        {delta ? (
          <div
            className={cn(
              "font-inter text-[11px]",
              featured
                ? "text-primary-foreground/80"
                : deltaUp
                  ? "text-success"
                  : "text-destructive",
            )}
          >
            {deltaUp ? "↑" : "↓"} {delta}
          </div>
        ) : (
          <span />
        )}
        {series && series.length > 0 ? (
          <Sparkline values={series} color={featured ? "hsl(var(--primary-foreground))" : "hsl(var(--primary))"} />
        ) : null}
      </div>
    </GlassCard>
  );
}
