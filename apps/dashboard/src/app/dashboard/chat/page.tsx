"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Lock,
  MessageSquare,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AlertDialog, Button } from "@heroui/react";
import type { HouseChatMode } from "@opendoor/shared";
import { formatPeriodWindow } from "@opendoor/shared";
import { cn } from "@/lib/utils";
import {
  HouseChatGuides,
  looksLikeCapabilityAsk,
  looksLikeCapabilityGuide,
} from "@/components/house-chat-guides";
import StreamingText from "@/components/ui/streaming-text";
import LoadingState from "@/components/ui/loading-state";
import ThinkingState from "@/components/ui/thinking-state";
import GradientChatInput, {
  SpectrumGlow,
} from "@/components/ruixen/gradient-chat-input";
import { Liquid } from "@/components/ui/liquid-gooey";
import { AiCrest } from "@/components/ui/ai-crest";
import type { OrbState } from "thinking-orbs";

type Allowance = {
  periodUsed: number;
  periodLimit: number;
  periodRemaining: number;
  periodMinutesRemaining: number | null;
  weeklyUsed: number;
  weeklyLimit: number;
  weeklyRemaining: number;
  weeklyMinutesRemaining: number | null;
  allowed: boolean;
  reason: string;
  refillLabel: string | null;
  periodWindow: string;
  unlimited?: boolean;
};

type Thread = {
  id: string;
  title: string;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode?: string | null;
  reasoning?: string | null;
};

const MODES: { id: HouseChatMode; label: string; hint: string }[] = [
  { id: "flash", label: "Flash", hint: "Free taste" },
  { id: "auto", label: "Auto", hint: "Let Qwen decide" },
  { id: "thinking", label: "Thinking", hint: "Reason first" },
  { id: "max", label: "MAX", hint: "Think + full Max answer" },
  { id: "max_fast", label: "Max Fast", hint: "Priority thinking" },
];

export default function HouseChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [protectedChild, setProtectedChild] = useState(false);
  const [children, setChildren] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [mode, setMode] = useState<HouseChatMode>("flash");
  const [modeOpen, setModeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selfUserId = useRef<string | null>(null);

  const rainbowOn = messages.some((m) => /\brainbow\b/i.test(m.content || ""));

  const allowanceLine = allowance
    ? allowance.unlimited
      ? "Unlimited · site admin"
      : allowance.allowed
        ? `${allowance.periodRemaining}/${allowance.periodLimit} every ${formatPeriodWindow(allowance.periodWindow)} · ${allowance.weeklyRemaining}/${allowance.weeklyLimit} this week`
        : allowance.refillLabel || "Allowance exhausted"
    : "…";

  const refreshList = useCallback(async (memberId?: string | null): Promise<Allowance | null> => {
    const qs = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";
    const res = await fetch(`/api/house-chat${qs}`, { credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not load OpenDoor Chat");
      return null;
    }
    const data = await res.json();
    setError(null);
    setThreads(data.threads || []);
    const nextAllowance = (data.allowance || null) as Allowance | null;
    setAllowance(nextAllowance);
    setProtectedChild(Boolean(data.protectedChild));
    setChildren(data.children || []);
    setIsOrganizer(Boolean(data.isOrganizer));
    setViewingMemberId(data.viewingMemberId || null);
    if (!selfUserId.current && !memberId) selfUserId.current = data.viewingMemberId;
    return nextAllowance;
  }, []);

  const loadChat = useCallback(async (id: string) => {
    const res = await fetch(`/api/house-chat/${id}`, { credentials: "include" });
    if (!res.ok) {
      setError("Could not load chat");
      return;
    }
    const data = await res.json();
    setChatId(id);
    setMessages(data.messages || []);
    setReadOnly(Boolean(data.readOnly));
    setError(null);
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (messages.length > 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, streamingReasoning, loading]);

  const ensureChat = async (): Promise<string | null> => {
    if (chatId) return chatId;
    const res = await fetch("/api/house-chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setError("Could not create chat");
      return null;
    }
    const data = await res.json();
    setChatId(data.id);
    setThreads((prev) => [{ id: data.id, title: "New chat", updatedAt: new Date().toISOString() }, ...prev]);
    return data.id as string;
  };

  const sendMessage = async (opts?: { regenerateFrom?: ChatMessage; text?: string }) => {
    if (readOnly || loading) return;
    if (allowance && !allowance.allowed) {
      setError(allowance.refillLabel || "Allowance exhausted");
      return;
    }

    const text = opts?.regenerateFrom
      ? messages.filter((m) => m.role === "user").slice(-1)[0]?.content || ""
      : (opts?.text ?? "").trim();
    if (!text && images.length === 0) return;

    const id = await ensureChat();
    if (!id) return;

    setLoading(true);
    setError(null);
    setStreamingReasoning("");
    const imageSnapshot = [...images];
    setImages([]);

    if (!opts?.regenerateFrom) {
      setMessages((prev) => [
        ...prev,
        { id: `tmp-${Date.now()}`, role: "user", content: text },
        { id: `stream-${Date.now()}`, role: "assistant", content: "", mode },
      ]);
    } else {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { id: `stream-${Date.now()}`, role: "assistant", content: "", mode },
      ]);
    }

    const content =
      imageSnapshot.length > 0 && !protectedChild
        ? [
            { type: "text" as const, text },
            ...imageSnapshot.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ]
        : text;

    try {
      const res = await fetch(`/api/house-chat/${id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: opts?.regenerateFrom ? undefined : content,
          mode,
          regenerate: Boolean(opts?.regenerateFrom),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Send failed");
        if (data.allowance) setAllowance(data.allowance);
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("stream-")));
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      let reasoning = "";

      const applyEvent = (payload: string) => {
        if (!payload || payload === "[DONE]") return;
        const evt = JSON.parse(payload) as {
          type: string;
          text?: string;
          content?: string;
          reasoning?: string | null;
          messageId?: string;
          allowance?: Allowance;
          error?: string;
          mode?: string;
        };
        if (evt.type === "content" && evt.text) {
          assistant += evt.text;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: assistant };
            }
            return next;
          });
        }
        if (evt.type === "reasoning" && evt.text) {
          reasoning += evt.text;
          setStreamingReasoning(reasoning);
        }
        if (evt.type === "done") {
          if (evt.allowance) setAllowance(evt.allowance);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                id: evt.messageId || last.id,
                role: "assistant",
                content: evt.content || assistant,
                reasoning: evt.reasoning || reasoning || null,
                mode: evt.mode || mode,
              };
            }
            return next;
          });
          void refreshList(viewingMemberId === selfUserId.current ? null : viewingMemberId);
        }
        if (evt.type === "error") {
          setError(evt.error || "Stream error");
          setMessages((prev) =>
            prev.filter((m) => !m.id.startsWith("stream-") || Boolean(m.content))
          );
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.toLowerCase().startsWith("data:")) continue;
          try {
            applyEvent(trimmed.slice(5).trim());
          } catch {
            // ignore
          }
        }
      }
      if (buffer.trim().toLowerCase().startsWith("data:")) {
        try {
          applyEvent(buffer.trim().slice(5).trim());
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setLoading(false);
      setStreamingReasoning("");
    }
  };

  const onPickImage = (file: File) => {
    if (protectedChild) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImages((prev) => [...prev, reader.result as string]);
    };
    reader.readAsDataURL(file);
  };

  const deleteChat = async (id: string) => {
    await fetch(`/api/house-chat/${id}`, { method: "DELETE", credentials: "include" });
    if (chatId === id) {
      setChatId(null);
      setMessages([]);
    }
    void refreshList(viewingMemberId === selfUserId.current ? null : viewingMemberId);
  };

  const modeLabel = MODES.find((m) => m.id === mode)?.label || "Fast";
  const liveOrb: OrbState =
    mode === "thinking" || mode === "max" || mode === "max_fast" ? "solving" : mode === "flash" || mode === "fast" ? "composing" : "working";
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const showThreadGuides =
    !readOnly &&
    Boolean(lastAssistant?.content) &&
    (looksLikeCapabilityGuide(lastAssistant?.content || "") ||
      looksLikeCapabilityAsk(lastUser?.content || ""));

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 overflow-hidden"
      style={{ background: "hsl(var(--background))" }}
    >
      {/* Thread rail */}
      <aside
        className="hidden md:flex w-56 shrink-0 flex-col border-r"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <div className="p-3 border-b" style={{ borderColor: "hsl(var(--border))" }}>
          <button
            type="button"
            onClick={() => {
              setChatId(null);
              setMessages([]);
              setReadOnly(false);
              setError(null);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white"
            style={{ background: "hsl(var(--primary))" }}
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>
        {isOrganizer && children.length > 0 && (
          <div className="px-3 py-2 border-b space-y-1" style={{ borderColor: "hsl(var(--border))" }}>
            <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
              View
            </p>
            <button
              type="button"
              onClick={() => {
                void refreshList(null).then(() => {
                  setChatId(null);
                  setMessages([]);
                  setReadOnly(false);
                });
              }}
              className={cn(
                "w-full rounded-lg px-2 py-1.5 text-left text-xs",
                !viewingMemberId || viewingMemberId === selfUserId.current
                  ? "font-semibold"
                  : "opacity-70"
              )}
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              My chats
            </button>
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  void refreshList(c.id).then(() => {
                    setChatId(null);
                    setMessages([]);
                  });
                }}
                className={cn(
                  "w-full rounded-lg px-2 py-1.5 text-left text-xs flex items-center gap-1",
                  viewingMemberId === c.id ? "font-semibold" : "opacity-70"
                )}
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                <Lock className="h-3 w-3" />
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void loadChat(t.id)}
              className={cn(
                "group flex w-full items-center gap-1 rounded-lg px-2.5 py-2 text-left text-xs",
                chatId === t.id ? "bg-[var(--brand-soft)]" : "hover:bg-accent"
              )}
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              <MessageSquare className="h-3 w-3 shrink-0 opacity-50" />
              <span className="flex-1 truncate">{t.title}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(t);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--red-soft)]"
              >
                <Trash2 className="h-3 w-3" style={{ color: "hsl(var(--muted-foreground))" }} />
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main pane */}
      <div className="relative isolate flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SpectrumGlow active={rainbowOn} />
        <header
          className="relative z-10 flex shrink-0 items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))" }}
        >
          <MessageSquare className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                OpenDoor Chat
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-40" />
              {protectedChild && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--brand-soft)", color: "hsl(var(--primary))" }}
                >
                  <Lock className="h-2.5 w-2.5" />
                  Protected by a parent
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
              {allowanceLine}
            </p>
          </div>
        </header>

        <div ref={scrollContainerRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-36 pt-6 md:px-8">
          {messages.length === 0 && (
            <div className="mx-auto flex max-w-2xl flex-col pt-4">
              <div className="flex flex-col items-center gap-2 text-center mb-1">
                <AiCrest mood="idle" size={45} />
                <p className="text-sm font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Ask OpenDoor
                </p>
                <p className="text-xs max-w-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Open a box for questions, writing, code, tutoring, or a plain chat — then ask something basic and see how it goes.
                </p>
              </div>
              {!readOnly && (
                <HouseChatGuides
                  protectedChild={protectedChild}
                  disabled={loading}
                  onAsk={(text) => void sendMessage({ text })}
                />
              )}
            </div>
          )}

          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 min-h-full justify-end">
            {messages.map((msg) =>
              msg.role === "user" ? (
                <div key={msg.id} className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm"
                    style={{ background: "var(--brand-soft)", color: "hsl(var(--foreground))" }}
                  >
                    {msg.content}
                  </div>
                </div>
              ) : msg.role === "assistant" ? (
                <div key={msg.id} className="space-y-2">
                  {(msg.reasoning || (loading && streamingReasoning && msg.id.startsWith("stream-"))) && (
                    <div className="py-1">
                      <ThinkingState
                        variant="Reasoning"
                        liveReasoning={msg.reasoning || streamingReasoning}
                        isLive={loading && Boolean(streamingReasoning) && msg.id.startsWith("stream-")}
                      />
                    </div>
                  )}
                  {loading && msg.id.startsWith("stream-") && !msg.content ? (
                    <div className="py-2">
                      <LoadingState
                        variant={mode === "thinking" || mode === "max" ? "Orbit" : "Drive"}
                        orbState={liveOrb}
                        label={mode === "thinking" || mode === "max" ? "Thinking" : "Churning"}
                      />
                    </div>
                  ) : (
                    <StreamingText
                      text={msg.content}
                      streaming={loading && msg.id.startsWith("stream-")}
                      followUps={
                        lastAssistant?.id === msg.id &&
                        msg.content &&
                        !looksLikeCapabilityGuide(msg.content)
                          ? ["Ask a simpler follow-up", "Give me a concrete example I can try"]
                          : []
                      }
                      onCopy={() => void navigator.clipboard.writeText(msg.content)}
                      onRetry={
                        readOnly
                          ? undefined
                          : () => {
                              if (msg.mode) setMode(normalizeMode(msg.mode));
                              void sendMessage({ regenerateFrom: msg });
                            }
                      }
                      onFollowUp={(q) => void sendMessage({ text: q })}
                    />
                  )}
                  {showThreadGuides && lastAssistant?.id === msg.id && !loading && (
                    <HouseChatGuides
                      compact
                      protectedChild={protectedChild}
                      disabled={loading}
                      onAsk={(text) => void sendMessage({ text })}
                    />
                  )}
                </div>
              ) : null
            )}
            <div ref={endRef} />
          </div>
        </div>

        {(!readOnly || error) && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-5 pt-3"
            style={{ background: "linear-gradient(to top, rgba(0, 0, 0, 0.35) 0%, transparent 100%)" }}
          >
            {error && (
              <div
                className="pointer-events-auto mx-auto mb-2 max-w-2xl rounded-xl px-3 py-2 text-xs"
                style={{ background: "var(--red-soft)", color: "var(--red)" }}
              >
                {error}
                {allowance && !allowance.allowed && (
                  <span className="ml-2">
                    <Link href="/dashboard/playground" className="underline">
                      Playground
                    </Link>
                    {" · "}
                    <Link href="/dashboard/settings?tab=billing" className="underline">
                      Packs
                    </Link>
                  </span>
                )}
              </div>
            )}
            {!readOnly && images.length > 0 && (
              <div className="pointer-events-auto mx-auto mb-2 flex max-w-2xl gap-2">
                {images.map((src, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-14 w-14 rounded-lg object-cover border" style={{ borderColor: "hsl(var(--border))" }} />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-white"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!readOnly && !protectedChild && (
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickImage(f);
                  e.target.value = "";
                }}
              />
            )}
            {!readOnly && (
              <div className="pointer-events-auto mx-auto w-full max-w-2xl">
                <GradientChatInput
                  className="max-w-none"
                  placeholder="Ask OpenDoor"
                  autoReply={null}
                  showBubbles={false}
                  showGlow={false}
                  sound
                  conversationActive={rainbowOn}
                  disabled={loading}
                  canSend={images.length > 0}
                  hideAttach={protectedChild}
                  orbState={loading ? liveOrb : undefined}
                  beamActive={loading || rainbowOn}
                  beamColorful={rainbowOn}
                  onAttach={() => fileRef.current?.click()}
                  trailing={
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setModeOpen((o) => !o)}
                        className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
                      >
                        {modeLabel}
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </button>
                      {modeOpen && (
                        <Liquid
                          blur={8}
                          contrast={18}
                          fill="hsl(var(--background))"
                          shadow="0 10px 28px rgba(0,0,0,0.18)"
                          className="absolute bottom-full right-0 z-20 mb-2 flex w-48 flex-col p-1"
                        >
                          {MODES.map((m, i) => (
                            <Liquid.Item key={m.id} delay={i * 28} transition="snappy">
                              <button
                                type="button"
                                onClick={() => {
                                  setMode(m.id);
                                  setModeOpen(false);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs"
                                style={{ background: "transparent", color: "hsl(var(--foreground))" }}
                              >
                                <span>
                                  <span className="font-semibold">{m.label}</span>
                                  <span className="ml-1.5 opacity-50">{m.hint}</span>
                                </span>
                                {mode === m.id && <Check className="h-3.5 w-3.5" style={{ color: "hsl(var(--primary))" }} />}
                              </button>
                            </Liquid.Item>
                          ))}
                        </Liquid>
                      )}
                    </div>
                  }
                  onSend={(text) => {
                    if (!text && images.length === 0) return;
                    void sendMessage({ text });
                  }}
                />
              </div>
            )}
            <p className="mt-2 text-center text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              AI-generated content may not be accurate.
            </p>
          </div>
        )}
      </div>

      <AlertDialog.Backdrop
        isOpen={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        variant="blur"
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete chat permanently?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                This will permanently delete <strong className="font-semibold text-foreground">{deleteTarget?.title || "this chat"}</strong> and remove all of its messages. This action cannot be undone.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" onPress={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                slot="close"
                variant="danger"
                onPress={() => {
                  if (deleteTarget) {
                    void deleteChat(deleteTarget.id);
                    setDeleteTarget(null);
                  }
                }}
              >
                Delete Chat
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}

function normalizeMode(m: string): HouseChatMode {
  const x = m.toLowerCase();
  if (x === "thinking" || x === "fast" || x === "flash" || x === "max" || x === "max_fast" || x === "auto") return x;
  return "auto";
}
