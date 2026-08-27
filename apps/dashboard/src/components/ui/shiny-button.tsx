"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "default" | "sm" | "lg" | "icon"
}

export function ShinyButton({ className, size = "default", children, ...props }: ShinyButtonProps) {
  const [x, setX] = React.useState(50)

  return (
    <button
      type="button"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setX(((e.clientX - rect.left) / rect.width) * 100)
      }}
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-md font-medium",
        "bg-black text-white dark:bg-white dark:text-black",
        "transition-colors duration-200",
        size === "sm" && "h-9 px-3 text-xs",
        size === "default" && "h-10 px-5 text-sm",
        size === "lg" && "h-11 px-8 text-base",
        size === "icon" && "h-10 w-10",
        className,
      )}
      style={{ "--x": `${x}%` } as React.CSSProperties}
      {...props}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: `conic-gradient(from 0deg at var(--x) 50%, transparent 0deg, hsl(var(--primary) / 0.35) 60deg, transparent 120deg)`,
        }}
      />
      <span className="relative z-10">{children}</span>
    </button>
  )
}
