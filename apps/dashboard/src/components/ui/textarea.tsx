import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-[var(--md-shape-xs)] border border-[var(--md-outline)]",
          "bg-[var(--md-surface-container-highest)] px-4 py-3 text-sm",
          "text-[var(--md-on-surface)] placeholder:text-[var(--md-on-surface-variant)]",
          "outline-none transition-all duration-[200ms]",
          "focus:border-2 focus:border-[var(--md-primary)]",
          "disabled:cursor-not-allowed disabled:opacity-38",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
