"use client";

import { Loader2, Sparkles } from "lucide-react";
import { OPENBOT_ROSTER } from "@/lib/openbot-personas";
import { OpenBotAgentCard } from "./agent-card";
import { AskComposer } from "./ask-composer";
import type { useOpenBotWorkspace } from "./use-openbot-workspace";

type Workspace = ReturnType<typeof useOpenBotWorkspace>;

export function OpenBotHome({ workspace }: { workspace: Workspace }) {
  const locked = Boolean(workspace.addon && !workspace.addon.active);
  const price = workspace.addon?.amountUsd ?? 20;
  const fallbackName = workspace.fallback?.name || "General Assistant";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
      <div className="flex flex-col items-center">
        <h2 className="text-center text-sm font-medium uppercase tracking-tight text-muted-foreground">
          OPENBOT
        </h2>
        <h1 className="mt-1.5 text-center text-2xl font-bold tracking-tight text-foreground">
          Start a new channel
        </h1>
      </div>

      <div className="mt-8 flex w-full flex-col items-center">
        {locked ? (
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card px-5 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Agents is a ${price}/month add-on. Subscribe to talk to a coworker.
            </p>
            <button
              type="button"
              disabled={workspace.pending || workspace.addon?.configured === false}
              onClick={() => void workspace.subscribeAddon()}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              {workspace.pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Subscribe · ${price}/mo
            </button>
          </div>
        ) : (
          <AskComposer
            disabled={!workspace.modelId}
            pending={workspace.pending}
            fallbackName={fallbackName}
            agents={workspace.channels}
            onSubmit={(text) => workspace.startChannel(text)}
          />
        )}
        {workspace.error ? (
          <p className="mt-2 w-full max-w-2xl text-center text-sm text-destructive" role="alert">
            {workspace.error}
          </p>
        ) : null}
      </div>

      <div className="mt-10 w-full max-w-2xl">
        <h2 className="text-lg font-bold text-foreground">Explore agents</h2>
        <div className="mt-4 flex flex-row flex-wrap gap-4">
          {OPENBOT_ROSTER.map((persona) => (
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
      </div>
    </div>
  );
}
