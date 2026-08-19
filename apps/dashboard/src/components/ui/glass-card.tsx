"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export function GlassCard({
  className,
  children,
  hoverEffect = true,
}: {
  className?: string
  children?: React.ReactNode
  hoverEffect?: boolean
}) {
  return (
    <motion.div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white p-4 text-slate-800 sm:p-6",
        "dark:border-zinc-700/80 dark:bg-black dark:text-zinc-100",
        "shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.12)]",
        className,
      )}
      transition={hoverEffect ? { duration: 0.3, ease: [0.4, 0, 0.2, 1] } : undefined}
      whileHover={hoverEffect ? { y: -2 } : undefined}
    >
      {children}
    </motion.div>
  )
}
