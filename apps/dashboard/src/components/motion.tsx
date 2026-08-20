"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE, motionDuration } from "@/lib/page-motion";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DashboardMotionConfig({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: MOTION_DURATION.page, ease: MOTION_EASE }}
    >
      {children}
    </MotionConfig>
  );
}

export function FadeIn({
  children,
  className,
  delay = 0,
  variant = "page",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: "page" | "inner";
}) {
  const reduce = useReducedMotion();
  const duration = motionDuration(
    variant === "inner" ? MOTION_DURATION.pageInner : MOTION_DURATION.fade,
    reduce,
  );
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: variant === "inner" ? 4 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay: reduce ? 0 : delay, ease: MOTION_EASE }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className,
  appear = "fade",
}: {
  children: ReactNode;
  className?: string;
  /** `settle` keeps opacity at 1 so SSR overview content is never hidden. */
  appear?: "fade" | "settle";
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: reduce ? 0 : MOTION_DURATION.stagger,
            delayChildren: reduce ? 0 : appear === "settle" ? 0.04 : 0,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  appear = "fade",
}: {
  children: ReactNode;
  className?: string;
  appear?: "fade" | "settle";
}) {
  const reduce = useReducedMotion();
  const fade = appear === "fade";
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce
          ? { opacity: 1, y: 0 }
          : { opacity: fade ? 0 : 1, y: fade ? 8 : 6 },
        show: {
          opacity: 1,
          y: 0,
          transition: {
            duration: reduce ? 0 : MOTION_DURATION.fade,
            ease: MOTION_EASE,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function MotionPress({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className={cn("inline-flex", className)}
      whileHover={reduce ? undefined : { scale: 1.02 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={reduce ? { duration: 0 } : { duration: MOTION_DURATION.hover, ease: MOTION_EASE }}
    >
      {children}
    </motion.span>
  );
}

export function MotionOverlay({
  open,
  onDismiss,
  children,
  overlayClassName,
  panelClassName,
  ariaLabel = "Dialog",
}: {
  open: boolean;
  onDismiss?: () => void;
  children: ReactNode;
  overlayClassName?: string;
  panelClassName?: string;
  ariaLabel?: string;
}) {
  const reduce = useReducedMotion();
  const duration = motionDuration(MOTION_DURATION.fade, reduce);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss?.();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => !node.hasAttribute("disabled") && node.tabIndex !== -1,
      );
      if (nodes.length === 0) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [open, onDismiss]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4",
            overlayClassName,
          )}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration }}
        >
          {onDismiss ? (
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close"
              onClick={onDismiss}
            />
          ) : null}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className={cn("relative z-10 w-full", panelClassName)}
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration, ease: MOTION_EASE }}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
