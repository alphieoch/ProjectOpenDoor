"use client";

import { useState, type FormEvent, type Ref, type RefObject } from "react";
import Link from "next/link";
import { Loader2, Monitor, Pause, Play, Trash2 } from "lucide-react";
import { ComputerView } from "./computer-view";
import { useNeedsYou } from "./needs-you";
import { takeControl } from "./take-the-wheel";
import { GradientAvatar } from "./gradient-avatar";
import { openBotChatStatusLine } from "@/lib/agents/chat-thread";
import { isLeaderbotName } from "@/lib/openbot-leader";
import { AskComposer } from "./ask-composer";
import { DeleteAgentDialog, StopCoworkerDialog } from "./lifecycle-dialogs";
import { HouseToolChip } from "./tool-result";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string | null;
};

type Props = {
  agentId: string;
  name: string;
  modelId: string;
  status: string;
  statusMessage?: string | null;
  isolationLabel: string;
  addonActive: boolean;
  addonAmount: number;
  busy: boolean;
  sending: boolean;
  computerWorking?: boolean;
  input: string;
  chatError: string | null;
  messages: ChatMessage[];
  bottomRef: RefObject<HTMLDivElement | null>;
  onInput: (value: string) => void;
  onSend: (event: FormEvent) => void;
  onSendText: (text: string) => void | Promise<void>;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
  onComputerReady?: () => void;
};

export function CoworkerWorkspace({
  agentId,
  name,
  modelId,
  status,
  statusMessage,
  isolationLabel,
  addonActive,
  addonAmount,
  busy,
  sending,
  computerWorking = false,
  chatError,
  messages,
  bottomRef,
  onSendText,
  onStart,
  onStop,
  onDelete,
  onComputerReady,
}: Props) {
  const needsYou = useNeedsYou(agentId, true);
  const [confirm, setConfirm] = useState<"stop" | "delete" | null>(null);
  const statusLine = openBotChatStatusLine({ sending, usedComputer: computerWorking });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <GradientAvatar
            seed={agentId}
            name={name}
            size={22}
            status={status}
            computerStatus={needsYou && !sending ? "help_requested" : undefined}
          />
          <div className="min-w-0">
            <p className="truncate text-sm tracking-tight text-foreground">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {modelId} · {isolationLabel}
              {needsYou ? " · needs you" : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status === "running" ? (
            <button
              type="button"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              disabled={busy}
              onClick={() => setConfirm("stop")}
              aria-label="Stop"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Pause className="size-4" />}
            </button>
          ) : (
            <button
              type="button"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              disabled={busy || !addonActive}
              onClick={onStart}
              aria-label="Start"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            </button>
          )}
          <button
            type="button"
            className="relative grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            disabled={busy || status !== "running"}
            onClick={() => void takeControl(agentId)}
            aria-label={needsYou ? "Take the wheel — this Bot is waiting for you" : "Take the wheel"}
          >
            <Monitor className="size-4" />
            {needsYou ? <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-500" /> : null}
          </button>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            disabled={busy}
            onClick={() => setConfirm("delete")}
            aria-label="Delete"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </header>

      {!addonActive && (
        <div className="border-b border-border px-4 py-2 text-sm text-muted-foreground">
          Agents is a ${addonAmount}/month add-on.{" "}
          <Link href="/dashboard/agents" className="underline">
            Subscribe to chat
          </Link>
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <GradientAvatar
                  seed={agentId}
                  name={name}
                  size={48}
                  status={status}
                  computerStatus={needsYou && !sending ? "help_requested" : undefined}
                />
                <p className="max-w-sm text-sm text-muted-foreground">
                  {isLeaderbotName(name)
                    ? "Ask Leaderbot to coordinate coworkers, bring a specialist online, or check capacity before spawning."
                    : "Ask it to open a public page and watch the screen on the right. Take the wheel at a login wall."}
                </p>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "tool" ? (
                <HouseToolChip key={m.id || `${m.role}-${i}`} name={m.toolName} content={m.content} />
              ) : (
                <div
                  key={m.id || `${m.role}-${i}`}
                  className="rounded-xl px-3 py-2 text-sm"
                  style={{
                    background: m.role === "user" ? "hsl(var(--accent))" : "transparent",
                  }}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{m.role}</p>
                  <p className="whitespace-pre-wrap leading-6 text-foreground">{m.content}</p>
                </div>
              ),
            )}
            <div ref={bottomRef as Ref<HTMLDivElement>} />
            {statusLine ? <p className="px-1 text-sm text-muted-foreground">{statusLine}</p> : null}
          </div>
          <div className="mx-auto w-full max-w-2xl shrink-0 px-3 pb-4">
            {chatError ? (
              <p className="mb-2 text-sm text-destructive" role="alert">
                {chatError}
              </p>
            ) : null}
            <AskComposer
              compact
              pending={sending}
              disabled={!addonActive || status !== "running"}
              placeholder={
                !addonActive
                  ? "Subscribe to the Agents add-on to chat"
                  : status === "running"
                    ? "Ask anything"
                    : "Start the agent to chat"
              }
              onSubmit={(text) => onSendText(text)}
            />
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto p-4">
          <p className="mb-3 text-center text-sm text-muted-foreground">{name}&apos;s screen</p>
          <ComputerView
            computerId={agentId}
            agentName={name}
            active={status === "running"}
            onReady={onComputerReady}
          />
          {statusMessage ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{statusMessage}</p>
          ) : null}
        </aside>
      </div>

      <StopCoworkerDialog
        open={confirm === "stop"}
        busy={busy}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          setConfirm(null);
          onStop();
        }}
      />
      <DeleteAgentDialog
        open={confirm === "delete"}
        name={name}
        busy={busy}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={onDelete}
      />
    </div>
  );
}
