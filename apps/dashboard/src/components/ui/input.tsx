import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-[var(--md-shape-xs)] border border-[var(--md-outline)]",
          "bg-[var(--md-surface-container-highest)] px-4 py-3 text-sm",
          "text-[var(--md-on-surface)] placeholder:text-[var(--md-on-surface-variant)]",
          "outline-none transition-all duration-[200ms]",
          "focus:border-2 focus:border-[var(--md-primary)] focus:px-[15px] focus:py-[11px]",
          "disabled:cursor-not-allowed disabled:opacity-38",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
