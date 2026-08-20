"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { useDashboardProfile } from "@/components/dashboard/dashboard-frame";
import { OpenBotAgentsDialog } from "./agents-dialog";
import { OpenBotRail } from "./rail";
import { OpenBotSkillsDialog } from "./skills-dialog";
import { useOpenBotWorkspace } from "./use-openbot-workspace";

type Workspace = ReturnType<typeof useOpenBotWorkspace> & {
  openSkills: () => void;
  openAgents: () => void;
};

const OpenBotWorkspaceContext = createContext<Workspace | null>(null);
const RAIL_KEY = "openbot-channel-rail";

export function useOpenBotShell() {
  const value = useContext(OpenBotWorkspaceContext);
  if (!value) throw new Error("useOpenBotShell must be used inside OpenBotShell");
  return value;
}

export function OpenBotShell({ children }: { children: React.ReactNode }) {
  const workspace = useOpenBotWorkspace();
  const { displayName } = useDashboardProfile();
  const router = useRouter();
  const [pinned, setPinned] = useState(true);
  const [mobileRail, setMobileRail] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const openSkills = useCallback(() => setSkillsOpen(true), []);
  const openAgents = useCallback(() => setAgentsOpen(true), []);
  const shell = useMemo(
    () => ({ ...workspace, openSkills, openAgents }),
    [workspace, openSkills, openAgents],
  );

  useEffect(() => {
    setPinned(window.localStorage.getItem(RAIL_KEY) !== "0");
  }, []);

  function setRailPinned(next: boolean) {
    setPinned(next);
    window.localStorage.setItem(RAIL_KEY, next ? "1" : "0");
  }

  const railProps = {
    hostedInDashboard: true as const,
    channels: workspace.channels,
    displayName,
    onNewChannel: () => {
      setMobileRail(false);
      router.push("/dashboard/openbot");
    },
    onOpenLeader: () => {
      setMobileRail(false);
      void workspace.startChannel("", "leader");
    },
    onOpenSkills: () => {
      setMobileRail(false);
      setSkillsOpen(true);
    },
    onOpenAgents: () => {
      setMobileRail(false);
      setAgentsOpen(true);
    },
    agentsOpen,
  };

  return (
    <OpenBotWorkspaceContext.Provider value={shell}>
      <div className="flex h-full min-h-0 w-full flex-1 bg-background text-foreground">
        <div className="relative z-20 hidden h-full min-h-0 shrink-0 self-stretch md:flex">
          <OpenBotRail
            {...railProps}
            pinned={pinned}
            onPinnedChange={setRailPinned}
          />
        </div>
        {mobileRail ? (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <button
              type="button"
              aria-label="Close channels"
              className="absolute inset-0 bg-background/60"
              onClick={() => setMobileRail(false)}
            />
            <div className="relative z-10 h-full">
              <OpenBotRail
                {...railProps}
                pinned
                onHide={() => setMobileRail(false)}
              />
            </div>
          </div>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 md:hidden">
            <button
              type="button"
              aria-label="Open channels"
              className="grid size-8 place-items-center text-muted-foreground"
              onClick={() => setMobileRail(true)}
            >
              <PanelLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold tracking-tight">OpenBot</span>
          </div>
          {children}
        </div>
      </div>
      <OpenBotSkillsDialog
        open={skillsOpen}
        onOpenChange={setSkillsOpen}
        channels={workspace.channels}
      />
      <OpenBotAgentsDialog
        open={agentsOpen}
        onOpenChange={setAgentsOpen}
        channels={workspace.channels}
        models={workspace.models}
        capacity={workspace.capacity}
        addon={workspace.addon}
        pending={workspace.pending}
        error={workspace.error}
        startChannel={workspace.startChannel}
      />
    </OpenBotWorkspaceContext.Provider>
  );
}
