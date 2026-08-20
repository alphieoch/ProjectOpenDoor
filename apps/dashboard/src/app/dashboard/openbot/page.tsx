"use client";

import { OpenBotHome } from "@/components/openbot/home";
import { useOpenBotShell } from "@/components/openbot/shell";

export default function OpenBotHomePage() {
  const workspace = useOpenBotShell();
  return <OpenBotHome workspace={workspace} />;
}
