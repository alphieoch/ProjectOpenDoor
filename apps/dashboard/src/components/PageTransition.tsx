"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatPlayground = pathname === "/dashboard/playground";
  const isHouseChat = pathname === "/dashboard/chat" || pathname?.startsWith("/dashboard/chat/");
  const isStudio = pathname === "/dashboard/studio" || pathname.startsWith("/dashboard/studio/");
  const isGovernance = pathname === "/dashboard/governance" || pathname.startsWith("/dashboard/governance/");
  const fillHeight = isChatPlayground || isHouseChat || isStudio || isGovernance || pathname === "/dashboard/pricing";
  const bleed = isChatPlayground || isHouseChat || isStudio;

  return (
    <div
      key={pathname}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col",
        !isHouseChat && "animate-in fade-in duration-150 ease-out",
        fillHeight ? "overflow-hidden" : "overflow-auto",
        bleed ? "p-0" : "p-3 md:p-6",
      )}
    >
      {children}
    </div>
  );
}
