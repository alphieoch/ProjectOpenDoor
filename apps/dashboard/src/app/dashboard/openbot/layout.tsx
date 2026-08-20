"use client";

import { OpenBotShell } from "@/components/openbot/shell";

export default function OpenBotLayout({ children }: { children: React.ReactNode }) {
  return <OpenBotShell>{children}</OpenBotShell>;
}
