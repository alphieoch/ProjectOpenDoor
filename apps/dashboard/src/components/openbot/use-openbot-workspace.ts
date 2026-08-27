"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_OPENBOT_PERSONA,
  LEADERBOT_PERSONA,
  getOpenBotPersona,
  parseComposerAsk,
  type OpenBotPersona,
} from "@/lib/openbot-personas";
import {
  findExistingLeaderbot,
  isLeaderbotChannel,
  pinLeaderbotFirst,
  type OpenBotCapacity,
} from "@/lib/openbot-leader";
import { formatAgentStartError } from "@/lib/openbot-start-error";

export type OpenBotChannel = {
  id: string;
  name: string;
  runtime: string;
  modelId?: string | null;
  status: string;
  statusMessage?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  lastUsedAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
  kind?: "leader" | "coworker" | null;
  workspace?: {
    kind?: "leader" | "coworker";
    skills?: Array<{ id: string; name: string; source: string }>;
    computer?: { backend?: string; isolation?: { mode?: string }; status?: string };
  };
};

type CatalogOption = { id: string; label: string; provider: string; modality?: string; ready?: boolean };

export type AgentsAddon = {
  active: boolean;
  status: string;
  includedInPlan: boolean;
  amountUsd: number;
  configured: boolean;
  name: string;
};

export const OPENBOT_CHANNELS_CHANGED = "openbot:channels-changed";

export function notifyOpenBotChannelsChanged() {
  window.dispatchEvent(new Event(OPENBOT_CHANNELS_CHANGED));
}

export function useOpenBotWorkspace() {
  const router = useRouter();
  const [channels, setChannels] = useState<OpenBotChannel[]>([]);
  const [models, setModels] = useState<CatalogOption[]>([]);
  const [addon, setAddon] = useState<AgentsAddon | null>(null);
  const [capacity, setCapacity] = useState<OpenBotCapacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelId, setModelId] = useState("");
  const ensuringLeader = useRef(false);

  const load = useCallback(async () => {
    const [agentsRes, modelsRes] = await Promise.all([
      fetch("/api/agents", { credentials: "include" }),
      fetch("/api/models/available", { credentials: "include" }),
    ]);
    if (agentsRes.ok) {
      const data = await agentsRes.json();
      const rows = ((data.agents || []) as OpenBotChannel[]).filter((row) => row.runtime === "openbot");
      setChannels(pinLeaderbotFirst(rows));
      if (data.addon) setAddon(data.addon);
      if (data.capacity) setCapacity(data.capacity);
    }
    if (modelsRes.ok) {
      const rows = ((await modelsRes.json()).models || []) as CatalogOption[];
      const chat = rows.filter((row) => !row.modality || row.modality === "chat");
      setModels(chat);
      setModelId((prev) => prev || chat.find((row) => row.ready)?.id || chat[0]?.id || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener(OPENBOT_CHANNELS_CHANGED, onChange);
    return () => window.removeEventListener(OPENBOT_CHANNELS_CHANGED, onChange);
  }, [load]);

  const fallback = useMemo(() => {
    const named = channels.find(
      (channel) => channel.name.toLowerCase() === DEFAULT_OPENBOT_PERSONA.name.toLowerCase(),
    );
    if (named) return named;
    return channels.find((channel) => !isLeaderbotChannel(channel)) ?? channels[0];
  }, [channels]);

  const findByName = useCallback(
    (name: string) =>
      channels.find((channel) => channel.name.toLowerCase() === name.trim().toLowerCase()),
    [channels],
  );

  const applyAgent = useCallback((agent: OpenBotChannel) => {
    setChannels((prev) => pinLeaderbotFirst([agent, ...prev.filter((row) => row.id !== agent.id)]));
    return agent;
  }, []);

  const bootExisting = useCallback(
    async (existing: OpenBotChannel) => {
      if (existing.status === "running" || existing.status === "starting") return existing;
      const res = await fetch(`/api/agents/${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "running" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(formatAgentStartError(data, res.status));
      const agent = (data.agent || existing) as OpenBotChannel;
      if (agent.status === "failed") {
        throw new Error(agent.statusMessage || data.error || "Could not boot that coworker");
      }
      return applyAgent(agent);
    },
    [applyAgent],
  );

  const createOrOpen = useCallback(
    async (persona: OpenBotPersona) => {
      const existing =
        persona.id === "leader"
          ? findExistingLeaderbot(channels) ?? findByName(persona.name)
          : findByName(persona.name);
      if (existing) return bootExisting(existing);
      if (!modelId) throw new Error("No catalog model is ready yet");
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: persona.name,
          runtime: "openbot",
          modelId,
          systemPrompt: persona.systemPrompt,
          kind: persona.id === "leader" ? "leader" : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.agent) throw new Error(formatAgentStartError(data, res.status));
      const agent = data.agent as OpenBotChannel;
      if (agent.status === "failed") {
        throw new Error(agent.statusMessage || data.error || "Could not boot that coworker");
      }
      return applyAgent(agent);
    },
    [applyAgent, bootExisting, channels, findByName, modelId],
  );

  useEffect(() => {
    if (loading || ensuringLeader.current) return;
    if (findExistingLeaderbot(channels)) {
      ensuringLeader.current = true;
      return;
    }
    if (!addon?.active || !modelId) return;
    ensuringLeader.current = true;
    void createOrOpen(LEADERBOT_PERSONA).catch(() => {
      ensuringLeader.current = false;
    });
  }, [addon?.active, channels, createOrOpen, loading, modelId]);

  const startChannel = useCallback(
    async (raw: string, personaId?: string) => {
      const parsed = personaId
        ? { persona: getOpenBotPersona(personaId), message: raw.trim() }
        : parseComposerAsk(raw);
      setPending(true);
      setError(null);
      try {
        const agent = await createOrOpen(parsed.persona);
        if (parsed.message) {
          router.push(`/dashboard/openbot/${agent.id}?ask=${encodeURIComponent(parsed.message)}`);
        } else {
          router.push(`/dashboard/openbot/${agent.id}`);
        }
        return agent;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not start the channel.";
        setError(message);
        return null;
      } finally {
        setPending(false);
      }
    },
    [createOrOpen, router],
  );

  const subscribeAddon = useCallback(async () => {
    setPending(true);
    setError(null);
    const res = await fetch("/api/billing/addons/agents", { method: "POST", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (data.alreadyActive) {
      await load();
      return;
    }
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setError(data.error || "Could not start Agents checkout");
  }, [load]);

  return {
    channels,
    models,
    addon,
    capacity,
    loading,
    pending,
    error,
    setError,
    modelId,
    fallback,
    load,
    createOrOpen,
    startChannel,
    subscribeAddon,
  };
}
