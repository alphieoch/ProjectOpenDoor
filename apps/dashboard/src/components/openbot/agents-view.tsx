"use client";

import { useEffect } from "react";
import { OPENBOT_PERSONAS } from "@/lib/openbot-personas";
import { OpenBotAgentCard } from "./agent-card";
import { OpenBotHousePanel } from "./house-panel";
import { useOpenBotShell } from "./shell";

export function OpenBotAgentsView() {
  const workspace = useOpenBotShell();
  const { openAgents } = workspace;
  const locked = Boolean(workspace.addon && !workspace.addon.active);

  useEffect(() => {
    openAgents();
  }, [openAgents]);

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <h2 className="text-lg font-bold text-foreground">Agents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage this house of coworkers, pick each model, and check usage from the Agents dialog.
        </p>
        <button type="button" className="btn-secondary mt-6" onClick={openAgents}>
          Manage agents
        </button>

        <h3 className="mt-12 text-lg font-bold text-foreground">Your house</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Leaderbot and every OpenBot channel in this workspace share one house.
        </p>
        <div className="mt-4">
          {workspace.channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No OpenBot coworkers yet. Start one from Explore agents.
            </p>
          ) : (
            <OpenBotHousePanel
              agents={workspace.channels}
              hrefFor={(agent) => `/dashboard/openbot/${agent.id}`}
            />
          )}
        </div>

        <h3 className="mt-12 text-lg font-bold text-foreground">Explore agents</h3>
        <div className="mt-4 flex flex-row flex-wrap gap-4">
          {OPENBOT_PERSONAS.map((persona) => (
            <button
              key={persona.id}
              type="button"
              disabled={locked || workspace.pending}
              onClick={() => void workspace.startChannel("", persona.id)}
              className="text-left disabled:opacity-50"
            >
              <OpenBotAgentCard
                name={persona.name}
                avatarSeed={persona.avatarSeed}
                roleDescription={persona.roleDescription}
              />
            </button>
          ))}
        </div>
        {workspace.error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {workspace.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
