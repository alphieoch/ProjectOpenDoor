import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  compact,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "od-fade-up flex flex-wrap items-end justify-between gap-4",
        compact ? "mb-4" : "mb-8",
        className,
      )}
      style={{ paddingBottom: compact ? 12 : 22, borderBottom: "1px solid var(--line)" }}
    >
      <div>
        {eyebrow ? <div className="od-eyebrow">{eyebrow}</div> : null}
        <h1 className="page-title" style={{ marginTop: eyebrow ? 10 : 0 }}>
          {title}
        </h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
