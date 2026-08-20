"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  dashboardTransitionKey,
  isDashboardBleedRoute,
  isDashboardFillHeightRoute,
  MOTION_DURATION,
  MOTION_EASE,
  motionDuration,
} from "@/lib/page-motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/dashboard";
  const transitionKey = dashboardTransitionKey(pathname);
  const reduce = useReducedMotion();
  const fillHeight = isDashboardFillHeightRoute(pathname);
  const bleed = isDashboardBleedRoute(pathname);
  const duration = motionDuration(MOTION_DURATION.page, reduce);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey}
        data-transition-key={transitionKey}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -6 }}
        transition={{ duration, ease: MOTION_EASE }}
        className={cn(
          "relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col",
          fillHeight ? "overflow-hidden" : "overflow-auto",
          bleed ? "p-0" : "p-3 md:p-6",
        )}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
