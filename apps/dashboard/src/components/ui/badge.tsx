import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:    "md-badge md-badge-primary",
        secondary:  "md-badge md-badge-secondary",
        tertiary:   "md-badge md-badge-tertiary",
        destructive:"md-badge md-badge-error",
        outline:    "md-badge md-badge-surface border border-[var(--md-outline-variant)]",
        success:    "md-badge md-badge-tertiary",
        warning:    "md-badge" + " [background:var(--yellow-soft)] [color:var(--yellow)]",
        error:      "md-badge md-badge-error",
        neutral:    "md-badge md-badge-surface",
        info:       "md-badge md-badge-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
