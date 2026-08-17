"use client";

import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatPlayground = pathname === "/dashboard/playground";
  const isHouseChat = pathname === "/dashboard/chat" || pathname?.startsWith("/dashboard/chat/");
  const isStudio = pathname === "/dashboard/studio" || pathname.startsWith("/dashboard/studio/");
  const isGovernance = pathname === "/dashboard/governance" || pathname.startsWith("/dashboard/governance/");
  const fillHeight = isChatPlayground || isHouseChat || isStudio || isGovernance || pathname === "/dashboard/pricing";

  return (
    <div
      key={pathname}
      className={isHouseChat ? undefined : "animate-in fade-in-50 duration-100"}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: fillHeight ? "hidden" : "auto",
        padding: isChatPlayground || isHouseChat || isStudio ? 0 : "32px 40px 72px",
      }}
    >
      {children}
    </div>
  );
}
