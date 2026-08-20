"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isOpenBotReservedPathSegment } from "@opendoor/shared";
import { collapseConsecutiveDuplicateUserMessages, formatTurnFailureReply, isComputerToolName } from "@/lib/agents/chat-thread";
import { getAgentRuntime, type AgentRuntimeId } from "@/lib/agents/runtimes";
import { notifyOpenBotChannelsChanged } from "./use-openbot-workspace";

export type AgentWorkspace = {
  memory: Array<{ id: string; kind: string; content: string; createdAt: string }>;
  skills: Array<{ id: string; name: string; source: string; createdAt: string }>;
  outbox: Array<{ id: string; channel: string; recipient: string; body: string; createdAt: string }>;
  audit: Array<{ id: string; action: string; detail: string; allowed: boolean; createdAt: string; rule?: string; outcome?: string }>;
  computer?: {
    operator: "bot" | "human";
    status: string;
    helpReason: string | null;
    url: string | null;
    title: string | null;
    excerpt: string;
    links: Array<{ text: string; href: string }>;
    history: Array<{ id: string; url: string; title: string; status: number; createdAt: string }>;
    files: Array<{ path: string; updatedAt: string; bytes: number }>;
    components: Array<{ id: string; kind: string; title: string; body: string; createdAt: string }>;
    snapshotId?: number | null;
    elements?: Array<{ ref: string; role: string; name: string }>;
    backend?: "live" | "fetch";
    isolation?: { mode?: "container" | "shared" | "in-process"; container?: string | null };
  };
  probe: { ok: boolean; latencyMs: number; at: string; error?: string; modelsSeen?: number } | null;
  counts: { memory: number; skills: number; outbox: number; files?: number; audit?: number };
};

export type SessionAgent = {
  id: string;
  name: string;
  runtime: AgentRuntimeId;
  runtimeName: string;
  modelId: string;
  status: string;
  statusMessage?: string | null;
  gatewayUrl: string;
  workspace: AgentWorkspace;
};

export type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string | null;
};

export function isolationLabel(agent: SessionAgent) {
  const ws = agent.workspace;
  if (ws.computer?.isolation?.mode === "container") return "isolated Chromium";
  if (ws.computer?.backend === "live") return "shared Chromium";
  return "in-process";
}

export function useAgentSession(id: string, missingHref = "/dashboard/openbot") {
  const router = useRouter();
  const [agent, setAgent] = useState<SessionAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [computerWorking, setComputerWorking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [addonActive, setAddonActive] = useState(true);
  const [addonAmount, setAddonAmount] = useState(20);
  const bottomRef = useRef<HTMLDivElement>(null);
  const askedRef = useRef<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (isOpenBotReservedPathSegment(id)) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const res = await fetch(`/api/agents/${id}`, { credentials: "include" });
    if (res.status === 404) {
      router.push(missingHref);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setAgent(data.agent);
      if (!silent || !askedRef.current) {
        setMessages(collapseConsecutiveDuplicateUserMessages(data.messages || []));
      }
      if (data.addon) {
        setAddonActive(Boolean(data.addon.active));
        setAddonAmount(Number(data.addon.amountUsd || 20));
      }
    }
    setLoading(false);
  }, [id, missingHref, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const setStatus = useCallback(
    async (status: "running" | "stopped") => {
      setBusy(true);
      const res = await fetch(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setAgent(data.agent);
      else setChatError(data.error || "Could not update the agent");
      setBusy(false);
      return data.agent as SessionAgent | undefined;
    },
    [id],
  );

  const remove = useCallback(async () => {
    setBusy(true);
    const res = await fetch(`/api/agents/${id}`, { method: "DELETE", credentials: "include" });
    setBusy(false);
    if (res.ok) {
      notifyOpenBotChannelsChanged();
      router.push(missingHref);
    } else {
      const data = await res.json().catch(() => ({}));
      setChatError(typeof data.error === "string" ? data.error : "Could not delete the agent");
    }
  }, [id, missingHref, router]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setSending(true);
      setComputerWorking(false);
      setChatError(null);
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

      try {
      const res = await fetch(`/api/agents/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChatError(data.error || "Chat failed");
        setMessages((prev) => [...prev, { role: "assistant", content: formatTurnFailureReply() }]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        return;
      }
      const decoder = new TextDecoder();
      let assistant = "";
      let buffer = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n");
        buffer = chunks.pop() || "";
        for (const line of chunks) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data:")) continue;
          const payload = trimmedLine.slice(5).trim();
          if (!payload) continue;
          try {
            const json = JSON.parse(payload) as {
              type?: string;
              content?: string;
              name?: string;
              detail?: string;
              display?: string;
            };
            if (json.type === "tool" && json.name) {
              if (isComputerToolName(json.name)) setComputerWorking(true);
              const content = (json.display || json.detail || json.name).trim();
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "tool", content, toolName: json.name },
                prev[prev.length - 1] || { role: "assistant", content: assistant },
              ]);
            }
            if (json.type === "delta" && typeof json.content === "string") {
              assistant += json.content;
              setMessages((prev) => {
                const next = [...prev];
                const last = next.length - 1;
                if (next[last]?.role === "assistant") next[last] = { ...next[last], content: assistant };
                else next.push({ role: "assistant", content: assistant });
                return next;
              });
            }
          } catch {
            /* ignore */
          }
        }
      }
      const refreshed = await fetch(`/api/agents/${id}`, { credentials: "include" });
      if (refreshed.ok) {
        const data = await refreshed.json();
        setAgent(data.agent);
        if (Array.isArray(data.messages) && data.messages.length) {
          setMessages(collapseConsecutiveDuplicateUserMessages(data.messages));
        }
      }
      notifyOpenBotChannelsChanged();
      } finally {
        setSending(false);
        setComputerWorking(false);
      }
    },
    [id],
  );

  const send = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!input.trim() || !agent) return;
      const text = input.trim();
      setInput("");
      await sendText(text);
    },
    [agent, input, sendText],
  );

  const consumeAsk = useCallback(
    async (ask: string | null) => {
      if (!ask || !agent || askedRef.current === ask) return;
      if (agent.status !== "running") {
        if (agent.status === "stopped" || agent.status === "failed") {
          await setStatus("running");
        }
        return;
      }
      askedRef.current = ask;
      await sendText(ask);
    },
    [agent, sendText, setStatus],
  );

  return {
    agent,
    runtime: agent ? getAgentRuntime(agent.runtime) : undefined,
    loading,
    busy,
    input,
    setInput,
    messages,
    sending,
    computerWorking,
    chatError,
    addonActive,
    addonAmount,
    bottomRef,
    load,
    setStatus,
    remove,
    send,
    sendText,
    consumeAsk,
  };
}
