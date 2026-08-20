"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { OpenBotAgentsView } from "@/components/openbot/agents-view";
import { CoworkerWorkspace } from "@/components/openbot/coworker-workspace";
import { isolationLabel, useAgentSession } from "@/components/openbot/use-agent-session";

export default function OpenBotChannelPage() {
  const params = useParams();
  const id = params.id as string;
  if (id === "agents") return <OpenBotAgentsView />;
  return <OpenBotCoworkerPage id={id} />;
}

function OpenBotCoworkerPage({ id }: { id: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const session = useAgentSession(id);
  const ask = search.get("ask");
  const agentStatus = session.agent?.status;
  const agentRuntime = session.agent?.runtime;

  useEffect(() => {
    if (agentRuntime && agentRuntime !== "openbot") {
      router.replace(`/dashboard/agents/${id}`);
    }
  }, [agentRuntime, id, router]);

  useEffect(() => {
    if (!ask || !session.agent) return;
    if (agentStatus === "stopped" || agentStatus === "failed") {
      void session.setStatus("running");
    }
  }, [ask, agentStatus, session.agent, session.setStatus]);

  useEffect(() => {
    if (!ask || !session.agent) return;
    if (agentStatus !== "running") {
      const timer = window.setInterval(() => {
        void session.load(true);
      }, 1500);
      return () => window.clearInterval(timer);
    }
    void session.consumeAsk(ask).then(() => {
      router.replace(`/dashboard/openbot/${id}`, { scroll: false });
    });
  }, [ask, agentStatus, id, router, session.agent, session.consumeAsk, session.load]);

  if (session.loading || !session.agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <CoworkerWorkspace
      agentId={session.agent.id}
      name={session.agent.name}
      modelId={session.agent.modelId}
      status={session.agent.status}
      statusMessage={session.agent.statusMessage}
      isolationLabel={isolationLabel(session.agent)}
      addonActive={session.addonActive}
      addonAmount={session.addonAmount}
      busy={session.busy}
      sending={session.sending}
      computerWorking={session.computerWorking}
      input={session.input}
      chatError={session.chatError}
      messages={session.messages}
      bottomRef={session.bottomRef}
      onInput={session.setInput}
      onSend={session.send}
      onSendText={session.sendText}
      onStart={() => void session.setStatus("running")}
      onStop={() => void session.setStatus("stopped")}
      onDelete={() => void session.remove()}
      onComputerReady={() => void session.load(true)}
    />
  );
}
