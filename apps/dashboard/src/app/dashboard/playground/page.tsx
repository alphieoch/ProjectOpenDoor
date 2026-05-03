"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Send, Loader2, Sparkles, ImagePlus, X, Copy, Check,
  ChevronDown, ChevronRight, Settings2, RotateCcw, Download,
  Cpu, Eye, Code2, Zap, Paperclip, SquareTerminal, MessageSquare,
  SlidersHorizontal, Plus, Trash2,
} from "lucide-react";
import posthog from "posthog-js";

// ─── Model registry ──────────────────────────────────────────────────────────

const MODELS = [
  // OpenAI
  { id: "gpt-4o",          name: "GPT-4o",           provider: "OpenAI",     vision: true,  code: false, context: "128K" },
  { id: "gpt-4o-mini",     name: "GPT-4o Mini",       provider: "OpenAI",     vision: true,  code: false, context: "128K" },
  { id: "gpt-4-turbo",     name: "GPT-4 Turbo",       provider: "OpenAI",     vision: true,  code: false, context: "128K" },
  { id: "gpt-4",           name: "GPT-4",             provider: "OpenAI",     vision: false, code: false, context: "8K"   },
  { id: "gpt-3.5-turbo",   name: "GPT-3.5 Turbo",     provider: "OpenAI",     vision: false, code: false, context: "16K"  },
  // Anthropic
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "Anthropic", vision: true,  code: false, context: "200K" },
  { id: "claude-3-opus-20240229",     name: "Claude 3 Opus",     provider: "Anthropic", vision: true,  code: false, context: "200K" },
  { id: "claude-3-haiku-20240307",    name: "Claude 3 Haiku",    provider: "Anthropic", vision: true,  code: false, context: "200K" },
  // Google
  { id: "gemini-1.5-pro",   name: "Gemini 1.5 Pro",   provider: "Google",     vision: true,  code: false, context: "1M"   },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash",  provider: "Google",     vision: true,  code: false, context: "1M"   },
  // Cohere
  { id: "command-r-plus",   name: "Command R+",        provider: "Cohere",     vision: false, code: false, context: "128K" },
  { id: "command-r",        name: "Command R",         provider: "Cohere",     vision: false, code: false, context: "128K" },
  // Mistral
  { id: "mistral-large-latest",  name: "Mistral Large",   provider: "Mistral",  vision: false, code: false, context: "128K" },
  { id: "mistral-medium-latest", name: "Mistral Medium",  provider: "Mistral",  vision: false, code: false, context: "32K"  },
  { id: "mistral-small-latest",  name: "Mistral Small",   provider: "Mistral",  vision: false, code: false, context: "32K"  },
  { id: "codestral-latest",      name: "Codestral",       provider: "Mistral",  vision: false, code: true,  context: "32K"  },
  // DeepSeek
  { id: "deepseek-chat",    name: "DeepSeek Chat",     provider: "DeepSeek",   vision: false, code: false, context: "64K"  },
  { id: "deepseek-coder",   name: "DeepSeek Coder",    provider: "DeepSeek",   vision: false, code: true,  context: "64K"  },
  // Qwen
  { id: "qwen-max",         name: "Qwen Max",          provider: "Alibaba",    vision: false, code: false, context: "32K"  },
  { id: "qwen-plus",        name: "Qwen Plus",         provider: "Alibaba",    vision: false, code: false, context: "32K"  },
  { id: "qwen-turbo",       name: "Qwen Turbo",        provider: "Alibaba",    vision: false, code: false, context: "32K"  },
  // Microsoft / Azure
  { id: "phi-4",                         name: "Phi-4",              provider: "Microsoft", vision: false, code: true,  context: "16K"  },
  { id: "phi-3-medium-128k-instruct",    name: "Phi-3 Medium",       provider: "Microsoft", vision: false, code: true,  context: "128K" },
  { id: "phi-3-mini-128k-instruct",      name: "Phi-3 Mini",         provider: "Microsoft", vision: false, code: true,  context: "128K" },
  // Meta / Llama
  { id: "llama-3-3-70b-instruct",        name: "Llama 3.3 70B",      provider: "Meta",      vision: false, code: false, context: "128K" },
  { id: "llama-3-2-90b-vision-instruct", name: "Llama 3.2 90B Vision", provider: "Meta",    vision: true,  code: false, context: "128K" },
  { id: "llama-3-2-11b-vision-instruct", name: "Llama 3.2 11B Vision", provider: "Meta",    vision: true,  code: false, context: "128K" },
  { id: "llama-3-1-405b-instruct",       name: "Llama 3.1 405B",     provider: "Meta",      vision: false, code: false, context: "128K" },
  { id: "llama-3-1-70b-instruct",        name: "Llama 3.1 70B",      provider: "Meta",      vision: false, code: false, context: "128K" },
];

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI:    "#10A37F", Anthropic: "#D97706", Google: "#4285F4",
  Mistral:   "#7C5CFF", DeepSeek:  "#1A73E8", Cohere: "#39AA56",
  Alibaba:   "#FF6A00", Microsoft: "#0078D4", Meta:   "#0866FF",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
  timestamp: Date;
};

type CanvasMode = "chat" | "code" | "markdown";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }

/** Extract code blocks from a markdown string */
function parseCodeBlocks(text: string): Array<{ lang: string; code: string }> {
  const blocks: Array<{ lang: string; code: string }> = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ lang: m[1] || "text", code: m[2].trim() });
  }
  return blocks;
}

/** Render markdown-ish text to JSX without a library */
function RenderContent({ text, mode }: { text: string; mode: CanvasMode }) {
  if (!text) return null;
  if (mode === "code") {
    const blocks = parseCodeBlocks(text);
    const firstBlock = blocks[0];
    return (
      <pre className="od-code" style={{ fontSize: 13, lineHeight: 1.8, margin: 0, height: "100%", overflowY: "auto" }}>
        <code>{firstBlock ? firstBlock.code : text}</code>
      </pre>
    );
  }

  // Markdown-ish: split on code fences, render interleaved
  const parts = text.split(/(```[\w]*\n[\s\S]*?```)/g);
  return (
    <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--ink)", fontFamily: "var(--font-geist-sans)" }}>
      {parts.map((part, i) => {
        const codeMatch = part.match(/```(\w*)\n([\s\S]*?)```/);
        if (codeMatch) {
          return (
            <pre key={i} className="od-code" style={{ fontSize: 12.5, lineHeight: 1.7, margin: "12px 0", borderRadius: 10 }}>
              {codeMatch[1] && <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--font-mono)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>{codeMatch[1]}</div>}
              <code>{codeMatch[2].trim()}</code>
            </pre>
          );
        }
        return (
          <span key={i} style={{ whiteSpace: "pre-wrap" }}>
            {part.split(/\*\*(.*?)\*\*/g).map((chunk, j) =>
              j % 2 === 1 ? <strong key={j}>{chunk}</strong> : chunk
            )}
          </span>
        );
      })}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const model = MODELS.find(m => m.id === value) || MODELS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = MODELS.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.provider.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, m) => {
    (acc[m.provider] ||= []).push(m);
    return acc;
  }, {} as Record<string, typeof MODELS>);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 999, border: "1px solid var(--line)",
          background: "var(--paper-2)", cursor: "pointer", fontSize: 13, fontWeight: 500,
          color: "var(--ink)", transition: "all 0.12s",
        }}
        className="hover:border-[var(--ink-4)]"
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: PROVIDER_COLORS[model.provider] || "var(--brand)", flexShrink: 0 }} />
        {model.name}
        {model.vision && <span className="od-tag od-tag-blue" style={{ padding: "0 5px", fontSize: 9 }}>Vision</span>}
        {model.code && <span className="od-tag od-tag-green" style={{ padding: "0 5px", fontSize: 9 }}>Code</span>}
        <ChevronDown style={{ width: 12, height: 12, color: "var(--ink-3)" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0,
          width: 320, background: "var(--paper-2)", border: "1px solid var(--line)",
          borderRadius: 12, boxShadow: "0 16px 48px rgba(26,26,46,0.14)", zIndex: 100,
          overflow: "hidden",
        }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line-soft)" }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search models…"
              style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: "var(--ink)", background: "transparent", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {Object.entries(grouped).map(([provider, models]) => (
              <div key={provider}>
                <div style={{ padding: "8px 14px 4px", fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: PROVIDER_COLORS[provider] }} />
                  {provider}
                </div>
                {models.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { onChange(m.id); setOpen(false); setSearch(""); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "8px 14px", background: m.id === value ? "var(--brand-soft)" : "transparent",
                      border: "none", cursor: "pointer", fontSize: 13, color: m.id === value ? "var(--brand-deep)" : "var(--ink)",
                      fontFamily: "inherit", textAlign: "left", transition: "background 0.1s",
                    }}
                    className={m.id !== value ? "hover:bg-[var(--paper)]" : ""}
                  >
                    <span style={{ flex: 1 }}>{m.name}</span>
                    <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-4)" }}>{m.context}</span>
                    {m.vision && <Eye style={{ width: 12, height: 12, color: "#4285F4" }} />}
                    {m.code && <Code2 style={{ width: 12, height: 12, color: "#2E7D5B" }} />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ParamsPanel({
  temperature, setTemperature, maxTokens, setMaxTokens, topP, setTopP,
}: {
  temperature: number; setTemperature: (v: number) => void;
  maxTokens: number; setMaxTokens: (v: number) => void;
  topP: number; setTopP: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {[
        { label: "Temperature", value: temperature, setter: setTemperature, min: 0, max: 2, step: 0.05, fmt: (v: number) => v.toFixed(2) },
        { label: "Max tokens", value: maxTokens, setter: setMaxTokens, min: 256, max: 8192, step: 256, fmt: (v: number) => v.toLocaleString() },
        { label: "Top P", value: topP, setter: setTopP, min: 0, max: 1, step: 0.05, fmt: (v: number) => v.toFixed(2) },
      ].map(({ label, value, setter, min, max, step, fmt }) => (
        <div key={label}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <label style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>{label}</label>
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink-2)", fontWeight: 600 }}>{fmt(value)}</span>
          </div>
          <input
            type="range" min={min} max={max} step={step} value={value}
            onChange={e => setter(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--brand)", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
            <span>{min}</span><span>{max}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatBubble({ msg, isStreaming }: { msg: Message; isStreaming?: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", gap: 10, flexDirection: isUser ? "row-reverse" : "row", alignItems: "flex-start" }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: 999, flexShrink: 0,
        background: isUser ? "var(--ink)" : "var(--brand)",
        display: "grid", placeItems: "center", color: "white", fontSize: 11, fontWeight: 700,
      }}>
        {isUser ? "U" : <Sparkles style={{ width: 12, height: 12 }} />}
      </div>
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Images */}
        {msg.images && msg.images.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {msg.images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" style={{ maxWidth: 180, maxHeight: 120, borderRadius: 8, objectFit: "cover", border: "1px solid var(--line)" }} />
            ))}
          </div>
        )}
        {/* Bubble */}
        {msg.content && (
          <div style={{
            padding: "10px 14px",
            borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
            background: isUser ? "var(--ink)" : "var(--paper-2)",
            color: isUser ? "white" : "var(--ink)",
            border: isUser ? "none" : "1px solid var(--line)",
            fontSize: 13.5, lineHeight: 1.65,
          }}>
            {isStreaming ? (
              <span style={{ whiteSpace: "pre-wrap" }}>
                {msg.content}
                <span style={{ display: "inline-block", width: 2, height: 14, background: "var(--brand)", marginLeft: 2, animation: "od-pulse 1s ease-out infinite", borderRadius: 1 }} />
              </span>
            ) : (
              <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
            )}
          </div>
        )}
        <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--font-mono)", paddingInline: 2, textAlign: isUser ? "right" : "left" }}>
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlaygroundPage() {
  const [apiKey, setApiKey] = useState("");
  const [gatewayUrl] = useState(process.env.NEXT_PUBLIC_GATEWAY_URL || "https://api.opendoor.ai");
  const [modelId, setModelId] = useState("gpt-4o");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showParams, setShowParams] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful, concise assistant.");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [topP, setTopP] = useState(0.95);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("markdown");
  const [copiedCanvas, setCopiedCanvas] = useState(false);
  const [splitPct, setSplitPct] = useState(38);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [playgroundBeta, setPlaygroundBeta] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const model = useMemo(() => MODELS.find(m => m.id === modelId) || MODELS[0], [modelId]);
  const lastAssistant = useMemo(() => [...messages].reverse().find(m => m.role === "assistant"), [messages]);
  const canvasText = lastAssistant?.content || "";
  const codeBlocks = useMemo(() => parseCodeBlocks(canvasText), [canvasText]);

  // Auto-switch canvas mode when model or response changes
  useEffect(() => {
    if (model.code || codeBlocks.length > 0) setCanvasMode("code");
    else setCanvasMode("markdown");
  }, [model.code, codeBlocks.length]);

  useEffect(() => {
    const onFlags = () => setPlaygroundBeta(Boolean(posthog.isFeatureEnabled("opendoor_playground_beta")));
    posthog.onFeatureFlags(onFlags);
    onFlags();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Resize splitter
  const onSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startPct = splitPct;
    const containerW = containerRef.current?.clientWidth || 1000;

    const onMove = (ev: MouseEvent) => {
      const delta = ((ev.clientX - startX) / containerW) * 100;
      setSplitPct(Math.max(24, Math.min(60, startPct + delta)));
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [splitPct]);

  // Image handling
  function handleImageFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).slice(0, 4).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = e => {
        const url = e.target?.result as string;
        setImages(prev => [...prev.slice(-3), url]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleImageFiles(e.dataTransfer.files);
  }

  // Textarea auto-height
  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  // Build messages array for the API call
  function buildApiMessages() {
    const history = messages.map(m => {
      if (m.role === "assistant" || m.role === "system") {
        return { role: m.role, content: m.content };
      }
      if (m.images && m.images.length > 0 && model.vision) {
        return {
          role: "user" as const,
          content: [
            ...m.images.map(url => ({ type: "image_url" as const, image_url: { url } })),
            { type: "text" as const, text: m.content },
          ],
        };
      }
      return { role: "user" as const, content: m.content };
    });

    const userContent = model.vision && images.length > 0
      ? [
          ...images.map(url => ({ type: "image_url" as const, image_url: { url } })),
          { type: "text" as const, text: draft },
        ]
      : draft;

    return [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...history,
      { role: "user", content: userContent },
    ];
  }

  async function sendMessage() {
    if (!apiKey || !draft.trim()) return;
    setLoading(true);
    setError("");

    const userMsg: Message = { id: uid(), role: "user", content: draft.trim(), images: [...images], timestamp: new Date() };
    const assistantMsg: Message = { id: uid(), role: "assistant", content: "", timestamp: new Date() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setDraft("");
    setImages([]);
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    try {
      posthog.capture("playground_request_started", { model: modelId, has_images: images.length > 0 });

      const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelId,
          messages: buildApiMessages(),
          stream: true,
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || `Request failed: ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chars = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;
            try {
              const chunk = JSON.parse(data);
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                chars += content.length;
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsg.id ? { ...m, content: m.content + content } : m
                ));
              }
            } catch { /* ignore */ }
          }
        }
      }
      posthog.capture("playground_request_completed", { model: modelId, response_length: chars });
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "first_chat_completed" }),
      });
      posthog.capture("onboarding_step_completed", {
        onboarding_step: "first_chat_completed",
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setMessages(prev => prev.filter(m => m.id !== assistantMsg.id));
      posthog.capture("playground_request_failed", { model: modelId, error: err?.message });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  }

  function copyCanvas() {
    navigator.clipboard.writeText(canvasText);
    setCopiedCanvas(true);
    setTimeout(() => setCopiedCanvas(false), 2000);
  }

  function clearConversation() {
    setMessages([]);
    setError("");
    setImages([]);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", margin: "-40px -56px -80px", overflow: "hidden" }}>

      {/* ── Toolbar ── */}
      <div style={{
        height: 56, borderBottom: "1px solid var(--line)",
        background: "var(--paper-2)", display: "flex", alignItems: "center",
        paddingInline: 20, gap: 10, flexShrink: 0, zIndex: 10,
      }}>
        <div className="od-eyebrow" style={{ marginRight: 4 }}>Playground</div>
        <div style={{ width: 1, height: 20, background: "var(--line)" }} />

        <ModelPicker value={modelId} onChange={setModelId} />

        {/* Capability badges */}
        {model.vision && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "var(--blue-soft)", color: "var(--blue)", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
            <Eye style={{ width: 11, height: 11 }} /> Vision
          </div>
        )}
        {model.code && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "var(--green-soft)", color: "var(--green)", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
            <Code2 style={{ width: 11, height: 11 }} /> Code
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "var(--paper-3)", color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
          <Zap style={{ width: 11, height: 11 }} /> {model.context}
        </div>

        <div style={{ flex: 1 }} />

        {/* API Key input */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 12 }}>
          <Cpu style={{ width: 12, height: 12, color: "var(--ink-3)" }} />
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="API key…"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "var(--ink)", fontFamily: "var(--font-mono)", width: 140 }}
          />
        </div>

        {/* Params toggle */}
        <button
          onClick={() => setShowParams(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 8,
            border: `1px solid ${showParams ? "var(--brand)" : "var(--line)"}`,
            background: showParams ? "var(--brand-soft)" : "var(--paper-2)",
            color: showParams ? "var(--brand-deep)" : "var(--ink-2)",
            fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
          }}
        >
          <SlidersHorizontal style={{ width: 13, height: 13 }} /> Params
        </button>

        {/* Clear */}
        <button
          onClick={clearConversation}
          title="Clear conversation"
          style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 8, border: "1px solid transparent", background: "transparent", color: "var(--ink-3)", cursor: "pointer", transition: "all 0.12s" }}
          className="hover:bg-[var(--paper-3)] hover:text-[var(--red)]"
        >
          <RotateCcw style={{ width: 14, height: 14 }} />
        </button>

        {/* Send */}
        <button
          onClick={sendMessage}
          disabled={loading || !apiKey || !draft.trim()}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 999,
            background: loading || !apiKey || !draft.trim() ? "var(--paper-3)" : "var(--brand)",
            color: loading || !apiKey || !draft.trim() ? "var(--ink-4)" : "white",
            border: "none", fontSize: 13, fontWeight: 500, cursor: loading || !apiKey || !draft.trim() ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {loading ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Send style={{ width: 14, height: 14 }} />}
          {loading ? "Running…" : "Run"}
          {!loading && <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", opacity: 0.7 }}>⌘↵</span>}
        </button>
      </div>

      {/* ── Params panel (slide-down) ── */}
      {showParams && (
        <div style={{
          borderBottom: "1px solid var(--line)", background: "var(--paper-2)",
          padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32,
          flexShrink: 0, zIndex: 9,
        }}>
          <ParamsPanel temperature={temperature} setTemperature={setTemperature}
            maxTokens={maxTokens} setMaxTokens={setMaxTokens}
            topP={topP} setTopP={setTopP} />
        </div>
      )}

      {/* ── Main split ── */}
      <div
        ref={containerRef}
        style={{ flex: 1, display: "flex", overflow: "hidden", userSelect: isDragging ? "none" : "auto" }}
      >
        {/* Left: chat panel */}
        <div style={{ width: `${splitPct}%`, display: "flex", flexDirection: "column", borderRight: "1px solid var(--line)", overflow: "hidden" }}>

          {/* System prompt */}
          <div style={{ borderBottom: "1px solid var(--line-soft)", flexShrink: 0 }}>
            <button
              onClick={() => setShowSystemPrompt(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%",
                padding: "10px 16px", background: "none", border: "none",
                cursor: "pointer", fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)",
              }}
            >
              {showSystemPrompt ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
              System prompt
              {systemPrompt && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: 999, background: "var(--brand)" }} />}
            </button>
            {showSystemPrompt && (
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={3}
                style={{
                  width: "100%", padding: "8px 16px 12px", border: "none", outline: "none",
                  background: "var(--paper)", fontFamily: "var(--font-mono)", fontSize: 12,
                  color: "var(--ink-2)", resize: "none", lineHeight: 1.6,
                  borderBottom: "1px solid var(--line-soft)",
                }}
                placeholder="System instructions…"
              />
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
            {messages.length === 0 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--ink-4)", textAlign: "center", padding: 32 }}>
                <div style={{ width: 48, height: 48, borderRadius: 999, background: "var(--brand-soft)", display: "grid", placeItems: "center" }}>
                  <MessageSquare style={{ width: 22, height: 22, color: "var(--brand)" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-3)" }}>Start a conversation</div>
                <div style={{ fontSize: 12, color: "var(--ink-4)", maxWidth: 200 }}>
                  {model.vision ? "You can attach images to your messages." : "Type a message and press ⌘↵ to send."}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                isStreaming={loading && i === messages.length - 1 && msg.role === "assistant"}
              />
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div style={{ margin: "0 16px 8px", padding: "10px 14px", borderRadius: 8, background: "var(--red-soft)", color: "var(--red)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <X style={{ width: 12, height: 12, flexShrink: 0 }} /> {error}
            </div>
          )}

          {/* Image previews */}
          {images.length > 0 && (
            <div style={{ display: "flex", gap: 8, padding: "8px 16px", flexWrap: "wrap" }}>
              {images.map((src, i) => (
                <div key={i} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
                  <button
                    onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                    style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 999, background: "var(--ink)", color: "white", border: "none", cursor: "pointer", display: "grid", placeItems: "center" }}
                  >
                    <X style={{ width: 10, height: 10 }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input area */}
          <div
            style={{
              borderTop: "1px solid var(--line)", padding: "12px 12px 14px",
              background: "var(--paper-2)", flexShrink: 0,
              outline: dragOver ? `2px solid var(--brand)` : "none",
              transition: "outline 0.15s",
            }}
            onDragOver={e => { e.preventDefault(); if (model.vision) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={model.vision ? handleDrop : undefined}
          >
            {dragOver && (
              <div style={{ position: "absolute", inset: 0, background: "var(--brand-soft)", display: "grid", placeItems: "center", borderRadius: 8, zIndex: 5, pointerEvents: "none", border: "2px dashed var(--brand)" }}>
                <div style={{ color: "var(--brand)", fontWeight: 600, fontSize: 14 }}>Drop images here</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              {model.vision && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleImageFiles(e.target.files)} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image"
                    style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-3)", cursor: "pointer", flexShrink: 0, transition: "all 0.12s" }}
                    className="hover:border-[var(--brand)] hover:text-[var(--brand)] hover:bg-[var(--brand-soft)]"
                  >
                    <ImagePlus style={{ width: 15, height: 15 }} />
                  </button>
                </>
              )}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={model.vision ? "Message (or drop an image)…" : "Message… (⌘↵ to send)"}
                style={{
                  flex: 1, border: "1px solid var(--line)", borderRadius: 10,
                  padding: "8px 12px", resize: "none", outline: "none",
                  fontSize: 13.5, lineHeight: 1.55, fontFamily: "inherit",
                  color: "var(--ink)", background: "var(--paper)", maxHeight: 160,
                  transition: "border 0.15s",
                  overflowY: "auto",
                }}
                className="focus:border-[var(--brand)]"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !apiKey || !draft.trim()}
                style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: loading || !apiKey || !draft.trim() ? "var(--paper-3)" : "var(--brand)",
                  color: loading || !apiKey || !draft.trim() ? "var(--ink-4)" : "white",
                  border: "none", display: "grid", placeItems: "center",
                  cursor: loading || !apiKey || !draft.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {loading
                  ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                  : <Send style={{ width: 14, height: 14 }} />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Drag handle ── */}
        <div
          onMouseDown={onSplitterMouseDown}
          style={{
            width: 6, flexShrink: 0, cursor: "col-resize",
            background: isDragging ? "var(--brand)" : "transparent",
            transition: "background 0.15s", zIndex: 5,
          }}
          className="hover:bg-[var(--brand-tint)]"
        />

        {/* Right: canvas panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--paper)" }}>
          {/* Canvas toolbar */}
          <div style={{
            height: 44, borderBottom: "1px solid var(--line)", background: "var(--paper-2)",
            display: "flex", alignItems: "center", paddingInline: 16, gap: 8, flexShrink: 0,
          }}>
            <span className="od-eyebrow">Canvas</span>
            <div style={{ flex: 1 }} />
            {/* Mode tabs */}
            <div className="od-tabs" style={{ padding: 3 }}>
              {(["markdown", "code"] as CanvasMode[]).map(m => (
                <button key={m} onClick={() => setCanvasMode(m)} className={canvasMode === m ? "active" : ""} style={{ padding: "4px 12px", fontSize: 11 }}>
                  {m === "markdown" ? <><MessageSquare style={{ width: 10, height: 10, display: "inline", marginRight: 4 }} />Rendered</> : <><Code2 style={{ width: 10, height: 10, display: "inline", marginRight: 4 }} />Code</>}
                </button>
              ))}
            </div>
            {/* Code blocks count */}
            {codeBlocks.length > 0 && (
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-3)", padding: "2px 8px", borderRadius: 4, background: "var(--paper-3)" }}>
                {codeBlocks.length} block{codeBlocks.length > 1 ? "s" : ""}
              </div>
            )}
            {canvasText && (
              <button
                onClick={copyCanvas}
                style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 6, border: "1px solid transparent", background: "transparent", color: "var(--ink-3)", cursor: "pointer", transition: "all 0.12s" }}
                className="hover:bg-[var(--paper-3)] hover:text-[var(--ink)]"
              >
                {copiedCanvas ? <Check style={{ width: 13, height: 13, color: "var(--green)" }} /> : <Copy style={{ width: 13, height: 13 }} />}
              </button>
            )}
          </div>

          {/* Canvas content */}
          <div style={{ flex: 1, overflowY: "auto", padding: canvasMode === "code" ? 0 : 32 }}>
            {!canvasText && (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "var(--ink-4)" }}>
                <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--paper-3)", display: "grid", placeItems: "center" }}>
                  <SquareTerminal style={{ width: 24, height: 24, color: "var(--ink-4)" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>Canvas is empty</div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)" }}>The model's response will appear here</div>
                </div>
                {/* Quick prompt suggestions */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 400, justifyContent: "center", marginTop: 8 }}>
                  {(model.vision
                    ? ["Describe this image", "What's in the photo?", "Analyze this chart"]
                    : model.code
                    ? ["Write a binary search", "Explain recursion", "Debug this code"]
                    : ["Explain quantum computing", "Write a haiku", "Summarize this topic"]
                  ).map(s => (
                    <button
                      key={s}
                      onClick={() => { setDraft(s); textareaRef.current?.focus(); }}
                      style={{
                        padding: "6px 14px", borderRadius: 999, border: "1px solid var(--line)",
                        background: "var(--paper-2)", color: "var(--ink-2)", fontSize: 12, fontWeight: 500,
                        cursor: "pointer", transition: "all 0.12s",
                      }}
                      className="hover:border-[var(--brand)] hover:text-[var(--brand)]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canvasText && <RenderContent text={canvasText} mode={canvasMode} />}
          </div>

          {/* Canvas footer: token count */}
          {canvasText && (
            <div style={{ borderTop: "1px solid var(--line-soft)", padding: "8px 16px", display: "flex", alignItems: "center", gap: 16, background: "var(--paper-2)", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-4)" }}>
                ~{Math.ceil(canvasText.length / 4).toLocaleString()} tokens out
              </span>
              {codeBlocks.length > 0 && (
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--green)" }}>
                  {codeBlocks.length} code block{codeBlocks.length > 1 ? "s" : ""} detected
                </span>
              )}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-4)" }}>
                {model.name} · temp {temperature.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* PostHog beta banner */}
      {playgroundBeta && (
        <div style={{
          position: "absolute", top: 64, left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999,
          background: "var(--brand-soft)", color: "var(--brand-deep)", fontSize: 12, fontWeight: 500,
          border: "1px solid var(--brand-tint)", zIndex: 20, boxShadow: "0 4px 16px rgba(124,92,255,0.2)",
        }}>
          <Sparkles style={{ width: 13, height: 13 }} />
          Beta mode active — feature flag <code style={{ fontFamily: "var(--font-mono)", background: "rgba(255,255,255,0.6)", padding: "0 4px", borderRadius: 3 }}>opendoor_playground_beta</code> is on
        </div>
      )}
    </div>
  );
}
