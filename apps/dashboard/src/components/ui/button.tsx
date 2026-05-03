import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all select-none cursor-pointer disabled:pointer-events-none disabled:opacity-38 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-primary)] focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        /* MD3 Filled */
        default: "md-btn-filled",
        /* MD3 Filled Tonal */
        secondary: "md-btn-tonal",
        /* MD3 Outlined */
        outline: "md-btn-outlined",
        /* MD3 Text */
        ghost: "md-btn-text",
        /* MD3 Elevated */
        elevated: "md-btn-elevated",
        /* Destructive */
        destructive: [
          "inline-flex items-center justify-center gap-2 h-10 px-6",
          "rounded-[var(--md-shape-full)] font-medium text-sm tracking-[0.1px]",
          "bg-[var(--md-error)] text-white border-none",
          "hover:shadow-md active:shadow-none",
          "transition-shadow",
        ].join(" "),
        link: "text-[var(--md-primary)] underline-offset-4 hover:underline bg-transparent border-none shadow-none",
      },
      size: {
        default: "h-10 px-6 text-sm",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10 p-0 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
