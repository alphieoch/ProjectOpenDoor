"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPlayground = pathname.startsWith("/dashboard/playground");
  const fillHeight = isPlayground || pathname === "/dashboard/pricing";

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: fillHeight ? "hidden" : "auto",
          padding: isPlayground ? 0 : "32px 40px 72px",
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
