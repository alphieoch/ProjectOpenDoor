"use client";

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Send, Loader2, Sparkles, ImagePlus, X, Copy, Check,
  ChevronDown, RotateCcw,
  Cpu, Eye, Code2, Zap,   Paperclip, SquareTerminal, MessageSquare,
  SlidersHorizontal, Plus,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import posthog from "posthog-js";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { ProviderLogo } from "@/components/ui/provider-logo";
import {
  formatGatewayError,
  inferModelModality,
  isChatModality,
  type ModelModality,
} from "@/lib/models/modality";

type CatalogModel = {
  id: string;
  name: string;
  provider: string;
  vision: boolean;
  code: boolean;
  context: string;
  modality: ModelModality;
  family?: string;
  ready?: boolean;
  mine?: boolean;
};

const PLAYGROUND_KEY = "od_playground_api_key";
const PLAYGROUND_MODEL_KEY = "od_playground_model";

const MY_LLMS_KEY = "od_my_llms";

function toCatalog(row: {
  id: string;
  label: string;
  provider: string;
  vision?: boolean;
  context?: string;
  mine?: boolean;
  modality?: ModelModality;
  family?: string;
  ready?: boolean;
}): CatalogModel {
  const id = row.id.toLowerCase();
  const mine =
    Boolean(row.mine) ||
    row.provider === "Local GPU" ||
    row.provider === "My LLM" ||
    row.id.startsWith("custom:");
  return {
    id: row.id,
    name: row.label,
    provider: mine ? "My LLM" : row.provider,
    vision: Boolean(row.vision) || /vision|gpt-4o|claude|gemini/.test(id),
    code: /coder|codestral|phi-/.test(id),
    context: row.context || "—",
    modality: row.modality || inferModelModality(row.id, row.label),
    family: row.family,
    ready: row.ready !== false || mine,
    mine,
  };
}

function pickDefaultChatModel(
  rows: CatalogModel[],
  requested?: string | null,
  current?: string,
): string {
  const chat = rows.filter((m) => isChatModality(m.modality));
  const ready = chat.filter((m) => m.ready !== false);
  const pool = ready.length ? ready : chat.length ? chat : rows;
  const inPool = (id?: string | null) => Boolean(id && pool.some((m) => m.id === id));
  if (inPool(requested)) return requested as string;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(PLAYGROUND_MODEL_KEY);
    if (inPool(stored)) return stored as string;
  }
  if (inPool(current)) return current as string;
  const mine = pool.find((m) => m.mine);
  if (mine) return mine.id;
  const preferred = pool.find((m) =>
    /llama3|llama-3|gpt-4o-mini|qwen2/.test(m.id.toLowerCase()),
  );
  return preferred?.id || pool[0]?.id || "";
}

function loadMyLlms(): CatalogModel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(MY_LLMS_KEY) || "[]") as Array<{ id: string; name?: string }>;
    return raw
      .filter((r) => r.id)
      .map((r) => ({
        id: r.id,
        name: r.name || r.id,
        provider: "My LLM",
        vision: false,
        code: false,
        context: "—",
        modality: inferModelModality(r.id, r.name || r.id),
        ready: true,
        mine: true,
      }));
  } catch {
    return [];
  }
}

function saveMyLlm(id: string) {
  const next = loadMyLlms().filter((m) => m.id !== id);
  next.unshift({ id, name: id, provider: "My LLM", vision: false, code: false, context: "—", modality: inferModelModality(id), ready: true, mine: true });
  localStorage.setItem(MY_LLMS_KEY, JSON.stringify(next.map((m) => ({ id: m.id, name: m.name }))));
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
  documents?: Array<{ id: string; name: string; size: number }>;
  timestamp: Date;
};

type CanvasMode = "chat" | "code" | "markdown";
type AttachedDocument = {
  id: string;
  name: string;
  size: number;
  content: string;
  truncated: boolean;
};

const DOC_MAX_BYTES = 1_000_000;
const DOC_MAX_CHARS = 12_000;
const SUPPORTED_DOC_EXTENSIONS = [
  ".txt", ".md", ".csv", ".json", ".js", ".ts", ".tsx",
  ".py", ".java", ".go", ".rb", ".php", ".xml", ".yml",
  ".yaml", ".sql", ".log", ".html", ".css",
];
const NATIVE_DOC_MODEL_IDS = new Set([
  "gpt-4o", "gpt-4o-mini",
  "claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307",
  "gemini-1.5-pro", "gemini-1.5-flash",
]);

/** Optional one-line blurbs for hover; unknown ids use `modelHoverBlurb`. */
const MODEL_SUMMARIES: Partial<Record<string, string>> = {
  "gpt-4o": "OpenAI flagship multimodal model—strong general reasoning, vision, and tool-style tasks.",
  "gpt-4o-mini": "Fast, lower-cost GPT-4 class model with vision and a large context window.",
  "gpt-4-turbo": "Capable GPT-4 variant tuned for quality on complex prompts and longer chats.",
  "claude-3-5-sonnet-20241022": "Anthropic’s balanced frontier model—long context, strong analysis and coding.",
  "claude-3-opus-20240229": "Highest-quality Claude 3 tier for difficult reasoning and nuanced writing.",
  "claude-3-haiku-20240307": "Fast, cost-efficient Claude 3 for high-volume chat and classification.",
  "gemini-1.5-pro": "Google’s large-context multimodal model—strong on long documents and mixed media.",
  "gemini-1.5-flash": "Lower-latency Gemini tuned for speed while keeping multimodal support.",
  "mistral-large-latest": "Mistral’s top-tier text model for reasoning, agents, and European hosting options.",
  "deepseek-chat": "DeepSeek general chat model—good for reasoning and open-domain dialogue.",
  "deepseek-coder": "DeepSeek model focused on code completion, debugging, and technical Q&A.",
};

function modelHoverBlurb(m: CatalogModel): string {
  if (m.ready === false) {
    return `${m.name} is listed but its provider is not configured on this machine. Use a local model, or add the provider API key.`;
  }
  if (m.mine || m.provider === "My LLM") {
    return `${m.name} is one of your models — a local pull, a GPU deployment, or an id you added. Calls go through the OpenDoor gateway.`;
  }
  return (
    MODEL_SUMMARIES[m.id] ??
    `${m.name} (${m.provider}). ${m.vision ? "Accepts image inputs with text." : "Text-first."} ${m.code ? "Strong for code and technical writing." : "General-purpose chat and analysis."}`
  );
}

function modelCapabilityLine(m: CatalogModel): string {
  const bits: string[] = [`${m.context} context`];
  bits.push(m.vision ? "Vision" : "No vision");
  bits.push(m.code ? "Code-leaning" : "General");
  if (NATIVE_DOC_MODEL_IDS.has(m.id)) bits.push("Native file upload (playground)");
  return bits.join(" · ");
}

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

function ModelPicker({
  value, onChange, models,
}: {
  value: string;
  onChange: (v: string) => void;
  models: CatalogModel[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [customId, setCustomId] = useState("");
  const [savedMine, setSavedMine] = useState<CatalogModel[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const allModels = useMemo(() => {
    const seen = new Set<string>();
    const merged: CatalogModel[] = [];
    for (const m of [...savedMine, ...models]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(m);
    }
    return merged;
  }, [models, savedMine]);
  const model = allModels.find(m => m.id === value) || allModels[0] || {
    id: "",
    name: "My LLM",
    provider: "My LLM",
    vision: false,
    code: false,
    context: "—",
    modality: "chat" as const,
    mine: true,
  };
  const previewModel = allModels.find((m) => m.id === (hoverId ?? value)) ?? model;

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) setHoverId(null);
    else setHoverId(value);
  }, [open, value]);

  useEffect(() => {
    setSavedMine(loadMyLlms());
  }, []);

  const filtered = allModels.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.provider.toLowerCase().includes(search.toLowerCase()) ||
    m.id.toLowerCase().includes(search.toLowerCase())
  );

  const mine = filtered.filter((m) => m.mine || m.provider === "My LLM");
  const grouped = filtered
    .filter((m) => !m.mine && m.provider !== "My LLM" && isChatModality(m.modality))
    .reduce((acc, m) => {
      (acc[m.provider] ||= []).push(m);
      return acc;
    }, {} as Record<string, CatalogModel[]>);
  const embeddings = filtered.filter((m) => !isChatModality(m.modality) && !m.mine);

  function useCustom(e: React.FormEvent) {
    e.preventDefault();
    const id = customId.trim();
    if (!id) return;
    saveMyLlm(id);
    setSavedMine(loadMyLlms());
    onChange(id);
    setCustomId("");
    setAdding(false);
    setOpen(false);
    setSearch("");
  }

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
        <ProviderLogo provider={model.provider} modelId={model.id} size={16} />
        {model.name}
        {model.vision && <span className="od-tag od-tag-blue" style={{ padding: "0 5px", fontSize: 9 }}>Vision</span>}
        {model.code && <span className="od-tag od-tag-green" style={{ padding: "0 5px", fontSize: 9 }}>Code</span>}
        <ChevronDown style={{ width: 12, height: 12, color: "var(--ink-3)" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0,
          width: 360, background: "var(--paper-2)", border: "1px solid var(--line)",
          borderRadius: 12, boxShadow: "0 16px 48px rgba(26,26,46,0.14)", zIndex: 100,
          overflow: "hidden", display: "flex", flexDirection: "column",
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
          <div style={{ maxHeight: 320, overflowY: "auto", flex: 1, minHeight: 0 }}>
            <div>
              <div style={{ padding: "8px 14px 4px", fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 7 }}>
                <ProviderLogo provider="My LLM" size={14} />
                My LLM
              </div>
              {mine.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseEnter={() => setHoverId(m.id)}
                  onClick={() => { onChange(m.id); setOpen(false); setSearch(""); }}
                  title={`${modelHoverBlurb(m)} — ${modelCapabilityLine(m)}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "8px 14px", background: m.id === value ? "var(--brand-soft)" : "transparent",
                    border: "none", cursor: "pointer", fontSize: 13, color: m.id === value ? "var(--brand-deep)" : "var(--ink)",
                    fontFamily: "inherit", textAlign: "left", transition: "background 0.1s",
                  }}
                  className={m.id !== value ? "hover:bg-[var(--paper)]" : ""}
                >
                  <ProviderLogo provider={m.provider} modelId={m.id} size={18} />
                  <span style={{ flex: 1 }}>{m.name}</span>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-4)" }}>{m.ready === false ? "needs key" : m.context}</span>
                </button>
              ))}
              {adding ? (
                <form onSubmit={useCustom} style={{ padding: "6px 14px 10px", display: "flex", gap: 6 }}>
                  <input
                    autoFocus
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value)}
                    placeholder="qwen2.5:7b or hf.co/org/repo"
                    style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink)", background: "var(--paper)" }}
                  />
                  <button type="submit" className="btn-primary" style={{ padding: "6px 10px", fontSize: 12 }}>Use</button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "8px 14px", background: "transparent", border: "none",
                    cursor: "pointer", fontSize: 13, color: "var(--ink-2)", fontFamily: "inherit", textAlign: "left",
                  }}
                  className="hover:bg-[var(--paper)]"
                >
                  <Plus style={{ width: 14, height: 14 }} />
                  Add my model
                </button>
              )}
              <div style={{ padding: "0 14px 10px", display: "flex", gap: 10 }}>
                <Link href="/dashboard/models" style={{ fontSize: 11, color: "var(--brand)", textDecoration: "none" }}>Import weights</Link>
                <Link href="/dashboard/deployments/new" style={{ fontSize: 11, color: "var(--brand)", textDecoration: "none" }}>Request GPU</Link>
              </div>
            </div>
            {embeddings.length > 0 && (
              <div>
                <div style={{ padding: "8px 14px 4px", fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ink-4)" }}>
                  Embeddings — not for chat
                </div>
                {embeddings.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseEnter={() => setHoverId(m.id)}
                    onClick={() => { onChange(m.id); setOpen(false); setSearch(""); }}
                    title={`${m.name} is an ${m.modality} model. Chat needs a completion model.`}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "8px 14px", background: m.id === value ? "var(--brand-soft)" : "transparent",
                      border: "none", cursor: "pointer", fontSize: 13, color: m.id === value ? "var(--brand-deep)" : "var(--ink-3)",
                      fontFamily: "inherit", textAlign: "left",
                    }}
                    className={m.id !== value ? "hover:bg-[var(--paper)]" : ""}
                  >
                    <ProviderLogo provider={m.provider} modelId={m.id} size={18} />
                    <span style={{ flex: 1 }}>{m.name}</span>
                    <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-4)" }}>{m.modality}</span>
                  </button>
                ))}
              </div>
            )}
            {Object.entries(grouped).map(([provider, models]) => (
              <div key={provider}>
                <div style={{ padding: "8px 14px 4px", fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 7 }}>
                  <ProviderLogo provider={provider} size={14} />
                  {provider}
                </div>
                {models.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseEnter={() => setHoverId(m.id)}
                    onClick={() => { onChange(m.id); setOpen(false); setSearch(""); }}
                    title={`${modelHoverBlurb(m)} — ${modelCapabilityLine(m)}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "8px 14px", background: m.id === value ? "var(--brand-soft)" : "transparent",
                      border: "none", cursor: "pointer", fontSize: 13, color: m.id === value ? "var(--brand-deep)" : "var(--ink)",
                      fontFamily: "inherit", textAlign: "left", transition: "background 0.1s",
                    }}
                    className={m.id !== value ? "hover:bg-[var(--paper)]" : ""}
                  >
                    <ProviderLogo provider={m.provider} modelId={m.id} size={18} />
                    <span style={{ flex: 1, opacity: m.ready === false ? 0.7 : 1 }}>{m.name}</span>
                    <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-4)" }}>{m.ready === false ? "needs key" : m.context}</span>
                    {m.vision && <Eye style={{ width: 12, height: 12, color: "#4285F4" }} />}
                    {m.code && <Code2 style={{ width: 12, height: 12, color: "#2E7D5B" }} />}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div
            role="note"
            style={{
              flexShrink: 0,
              borderTop: "1px solid var(--line-soft)",
              padding: "10px 14px",
              background: "var(--paper)",
              fontSize: 12,
              lineHeight: 1.45,
              color: "var(--ink-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
              <ProviderLogo provider={previewModel.provider} modelId={previewModel.id} size={18} />
              {previewModel.name}
            </div>
            <div style={{ marginBottom: 6 }}>{modelHoverBlurb(previewModel)}</div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-4)" }}>
              {modelCapabilityLine(previewModel)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamsPanel({
  temperature, setTemperature, maxTokens, setMaxTokens, topP, setTopP,
  dataClass, setDataClass,
  providerSort, setProviderSort, allowFallbacks, setAllowFallbacks,
  providerOrder, setProviderOrder,
}: {
  temperature: number; setTemperature: (v: number) => void;
  maxTokens: number; setMaxTokens: (v: number) => void;
  topP: number; setTopP: (v: number) => void;
  dataClass: string; setDataClass: (v: string) => void;
  providerSort: "default" | "price" | "latency" | "throughput";
  setProviderSort: (v: "default" | "price" | "latency" | "throughput") => void;
  allowFallbacks: boolean; setAllowFallbacks: (v: boolean) => void;
  providerOrder: string; setProviderOrder: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <label style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Data class</label>
        <p style={{ fontSize: 11, color: "var(--ink-4)", margin: "4px 0 8px" }}>Sent as X-Data-Class. Policies evaluate this before the model runs.</p>
        <select
          value={dataClass}
          onChange={(e) => setDataClass(e.target.value)}
          className="input w-full text-sm"
        >
          <option value="public">Public</option>
          <option value="internal">Internal</option>
          <option value="confidential">Confidential — may need approval</option>
          <option value="restricted">Restricted — usually blocked</option>
        </select>
      </div>
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
      <div>
        <label style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Provider sort</label>
        <p style={{ fontSize: 11, color: "var(--ink-4)", margin: "4px 0 8px" }}>OpenRouter-style routing. Sent as <code>provider.sort</code>.</p>
        <select
          value={providerSort}
          onChange={(e) => setProviderSort(e.target.value as "default" | "price" | "latency" | "throughput")}
          className="input w-full text-sm"
        >
          <option value="default">Default</option>
          <option value="price">Price</option>
          <option value="latency">Latency</option>
          <option value="throughput">Throughput</option>
        </select>
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={allowFallbacks}
          onChange={(e) => setAllowFallbacks(e.target.checked)}
          className="h-4 w-4 rounded accent-[var(--brand)]"
        />
        <span style={{ fontSize: 13, color: "var(--ink-2)" }}>Allow fallbacks</span>
      </label>
      <div>
        <label style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Provider order</label>
        <p style={{ fontSize: 11, color: "var(--ink-4)", margin: "4px 0 8px" }}>Optional comma-separated slugs.</p>
        <input
          type="text"
          value={providerOrder}
          onChange={(e) => setProviderOrder(e.target.value)}
          placeholder="together, groq"
          className="input w-full text-sm"
        />
      </div>
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
        {(msg.content || isStreaming) && (
          <div style={{
            padding: "10px 14px",
            borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
            background: isUser ? "var(--ink)" : "var(--paper-2)",
            color: isUser ? "white" : "var(--ink)",
            border: isUser ? "none" : "1px solid var(--line)",
            fontSize: 13.5, lineHeight: 1.65,
          }}>
            {isStreaming && !msg.content ? (
              <span style={{ color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                Connecting to model…
              </span>
            ) : isStreaming ? (
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

function PlaygroundPage() {
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [gatewayUrl] = useState(gatewayBaseUrl());
  const [modelId, setModelId] = useState(searchParams.get("model") || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<AttachedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showParams, setShowParams] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful, concise assistant.");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [topP, setTopP] = useState(0.95);
  const [dataClass, setDataClass] = useState("internal");
  const [providerSort, setProviderSort] = useState<"default" | "price" | "latency" | "throughput">("default");
  const [allowFallbacks, setAllowFallbacks] = useState(true);
  const [providerOrder, setProviderOrder] = useState("");
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("markdown");
  const [copiedCanvas, setCopiedCanvas] = useState(false);
  const [splitPct, setSplitPct] = useState(54);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [playgroundBeta, setPlaygroundBeta] = useState(false);
  const remintedKey = useRef(false);
  const [routeModelId, setRouteModelId] = useState("");
  const [gcpJob, setGcpJob] = useState<{ id: string; status: string; message: string } | null>(null);
  const [connection, setConnection] = useState<{
    phase: "loading" | "connected" | "offline" | "bad_key" | "idle" | "deploying";
    latencyMs: number | null;
    detail: string;
  }>({ phase: "loading", latencyMs: null, detail: "Loading connection…" });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const model = useMemo(
    () => catalog.find(m => m.id === modelId) || catalog.find(m => isChatModality(m.modality)) || catalog[0] || {
      id: "", name: "—", provider: "—", vision: false, code: false, context: "—", modality: "chat" as const,
    },
    [catalog, modelId]
  );
  const modelIsChat = isChatModality(model.modality);
  const runsOnGcp = Boolean(
    model.id &&
    !model.id.startsWith("custom:") &&
    modelIsChat &&
    model.family !== "closed" &&
    !/^(gpt-|claude-|gemini-|command-r)/i.test(model.id),
  );

  const ensureGcpFor = useCallback(async (id: string) => {
    setConnection({
      phase: "deploying",
      latencyMs: null,
      detail: "Starting this model on Google Cloud…",
    });
    const res = await fetch("/api/playground/gcp", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: id }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      model?: string;
      deploymentId?: string;
      status?: string;
      statusMessage?: string | null;
      hfRepo?: string;
    };
    if (!res.ok) {
      setGcpJob(null);
      setRouteModelId("");
      setConnection({ phase: "offline", latencyMs: null, detail: data.error || "Google Cloud deploy failed" });
      setError(data.error || "Google Cloud deploy failed");
      return null;
    }
    setRouteModelId(data.model || "");
    setGcpJob({
      id: data.deploymentId || "",
      status: data.status || "pending",
      message: data.statusMessage || `Provisioning ${data.hfRepo || id} on Cloud Run GPU`,
    });
    if (data.status === "running") {
      setConnection({
        phase: "connected",
        latencyMs: null,
        detail: `Connected · Google Cloud GPU · ${data.hfRepo || id}`,
      });
    } else {
      setConnection({
        phase: "deploying",
        latencyMs: null,
        detail: data.statusMessage || "Deploying to Google Cloud…",
      });
    }
    return data;
  }, []);

  useEffect(() => {
    if (!gcpJob?.id || gcpJob.status === "running" || gcpJob.status === "failed") return;
    let cancelled = false;
    const tick = async () => {
      const res = await fetch(`/api/playground/gcp?deploymentId=${encodeURIComponent(gcpJob.id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        statusMessage?: string | null;
        model?: string;
      };
      if (cancelled || !res.ok) return;
      setGcpJob((prev) => prev ? { ...prev, status: data.status || prev.status, message: data.statusMessage || prev.message } : prev);
      if (data.model) setRouteModelId(data.model);
      if (data.status === "running") {
        setConnection({ phase: "connected", latencyMs: null, detail: data.statusMessage || "Connected · Google Cloud GPU" });
      } else if (data.status === "failed") {
        setConnection({ phase: "offline", latencyMs: null, detail: data.statusMessage || "Google Cloud deploy failed" });
        setError(data.statusMessage || "Google Cloud deploy failed");
      } else {
        setConnection({ phase: "deploying", latencyMs: null, detail: data.statusMessage || "Deploying to Google Cloud…" });
      }
    };
    const timer = window.setInterval(() => { void tick(); }, 4000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gcpJob?.id, gcpJob?.status]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const stored = typeof window !== "undefined" ? localStorage.getItem(PLAYGROUND_KEY) : "";
        if (stored) setApiKey(stored);
        else {
          const created = await fetch("/api/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: "Playground" }),
          });
          if (created.ok) {
            const data = (await created.json()) as { key?: string };
            if (data.key && !cancelled) {
              localStorage.setItem(PLAYGROUND_KEY, data.key);
              setApiKey(data.key);
            }
          }
        }

        const mRes = await fetch("/api/models/available", { credentials: "include" });
        if (!mRes.ok) return;
        const mJson = (await mRes.json()) as { models?: Array<{ id: string; label: string; provider: string; vision?: boolean; context?: string; mine?: boolean; modality?: ModelModality; family?: string; ready?: boolean }> };
        const rows = (mJson.models || []).map(toCatalog);
        if (cancelled) return;
        setCatalog(rows);
        const requested = searchParams.get("model");
        setModelId((current) => {
          const next = pickDefaultChatModel(rows, requested, current);
          if (next && typeof window !== "undefined") localStorage.setItem(PLAYGROUND_MODEL_KEY, next);
          return next;
        });
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, [searchParams]);

  const probeConnection = useCallback(async (key: string) => {
    setConnection((prev) => ({
      ...prev,
      phase: prev.phase === "connected" ? "connected" : "loading",
      detail: key ? "Checking gateway…" : "Issuing playground key…",
    }));
    try {
      const headers: Record<string, string> = {};
      if (key) headers["x-playground-key"] = key;
      const res = await fetch("/api/playground/connection", {
        credentials: "include",
        headers,
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        key?: string;
        providers?: string[];
        gateway?: { status?: string; latencyMs?: number | null; url?: string; error?: string | null };
      };
      if (data.status === "connected") {
        const live = (data.providers || []).slice(0, 3).join(", ");
        const host = data.gateway?.url?.replace(/^https?:\/\//, "") || "gateway";
        setConnection({
          phase: "connected",
          latencyMs: data.gateway?.latencyMs ?? null,
          detail: live ? `Connected to ${host} · ${live}` : `Connected to ${host}`,
        });
        return;
      }
      if (data.status === "offline") {
        setConnection({
          phase: "offline",
          latencyMs: data.gateway?.latencyMs ?? null,
          detail: data.gateway?.error || `Gateway offline at ${data.gateway?.url || gatewayUrl}`,
        });
        return;
      }
      if (data.status === "bad_key" || data.key === "invalid") {
        setConnection({
          phase: "bad_key",
          latencyMs: data.gateway?.latencyMs ?? null,
          detail: remintedKey.current
            ? "Playground key was rejected. Paste a valid key from API Keys."
            : "Playground key was rejected. Minting a new one…",
        });
        if (remintedKey.current) return;
        remintedKey.current = true;
        localStorage.removeItem(PLAYGROUND_KEY);
        const created = await fetch("/api/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: "Playground" }),
        });
        if (created.ok) {
          const minted = (await created.json()) as { key?: string };
          if (minted.key) {
            localStorage.setItem(PLAYGROUND_KEY, minted.key);
            setApiKey(minted.key);
          }
        }
        return;
      }
      setConnection({
        phase: "loading",
        latencyMs: data.gateway?.latencyMs ?? null,
        detail: "Loading connection…",
      });
    } catch (err) {
      setConnection({
        phase: "offline",
        latencyMs: null,
        detail: err instanceof Error ? err.message : "Could not check the gateway",
      });
    }
  }, [gatewayUrl]);

  useEffect(() => {
    if (catalogLoading) {
      setConnection({ phase: "loading", latencyMs: null, detail: "Loading connection…" });
      return;
    }
    if (gcpJob && gcpJob.status !== "failed") return;
    void probeConnection(apiKey);
  }, [apiKey, catalogLoading, probeConnection, gcpJob]);

  useEffect(() => {
    if (modelId && isChatModality(model.modality) && model.ready !== false) {
      localStorage.setItem(PLAYGROUND_MODEL_KEY, modelId);
    }
  }, [modelId, model.modality, model.ready]);
  const modelSupportsDocs = useMemo(() => model.context !== "8K", [model.context]);
  const modelHasNativeDocs = useMemo(() => NATIVE_DOC_MODEL_IDS.has(model.id), [model.id]);
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

  function isSupportedDocFile(file: File) {
    const lower = file.name.toLowerCase();
    return SUPPORTED_DOC_EXTENSIONS.some(ext => lower.endsWith(ext)) || file.type.startsWith("text/");
  }

  async function handleDocumentFiles(files: FileList | null) {
    if (!files) return;
    const nextDocs: AttachedDocument[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      if (!isSupportedDocFile(file)) {
        setError(`Unsupported file type: ${file.name}. Use text/code formats like .txt, .md, .csv, .json, .ts, .py.`);
        continue;
      }
      if (file.size > DOC_MAX_BYTES) {
        setError(`File too large: ${file.name}. Max size is ${(DOC_MAX_BYTES / 1_000_000).toFixed(1)}MB.`);
        continue;
      }
      const raw = await file.text();
      const normalized = raw.trim();
      if (!normalized) continue;
      const content = normalized.slice(0, DOC_MAX_CHARS);
      nextDocs.push({
        id: uid(),
        name: file.name,
        size: file.size,
        content,
        truncated: normalized.length > DOC_MAX_CHARS,
      });
    }
    if (nextDocs.length) {
      setDocuments(prev => [...prev, ...nextDocs].slice(-4));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (model.vision) handleImageFiles(e.dataTransfer.files);
    void handleDocumentFiles(e.dataTransfer.files);
  }

  // Textarea auto-height
  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  // Build messages array for the API call
  function buildApiMessages() {
    const documentsContext = documents.length
      ? `\n\nAttached documents:\n${documents
          .map((d, idx) => `--- [${idx + 1}] ${d.name}${d.truncated ? " (truncated)" : ""} ---\n${d.content}`)
          .join("\n\n")}`
      : "";
    const draftWithDocuments = `${draft}${documentsContext}`;

    const history = messages.map(m => {
      if (m.role === "assistant" || m.role === "system") {
        return { role: m.role, content: m.content };
      }
      if (m.images && m.images.length > 0 && model.vision) {
        return {
          role: "user" as const,
          content: [
            ...m.images.map(url => ({ type: "image_url" as const, image_url: { url } })),
            {
              type: "text" as const,
              text: m.content + (m.documents?.length ? `\n\nAttached documents: ${m.documents.map(d => d.name).join(", ")}` : ""),
            },
          ],
        };
      }
      return { role: "user" as const, content: m.content };
    });

    const userContent = model.vision && images.length > 0
      ? [
          ...images.map(url => ({ type: "image_url" as const, image_url: { url } })),
          { type: "text" as const, text: draftWithDocuments },
        ]
      : draftWithDocuments;

    return [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...history,
      { role: "user", content: userContent },
    ];
  }

  function handleSelectModel(id: string) {
    setModelId(id);
    setRouteModelId("");
    setGcpJob(null);
    setError("");
    const next = catalog.find((m) => m.id === id);
    const useGcp =
      Boolean(next) &&
      isChatModality(next!.modality) &&
      next!.family !== "closed" &&
      !id.startsWith("custom:") &&
      !/^(gpt-|claude-|gemini-|command-r)/i.test(id);
    if (useGcp) void ensureGcpFor(id);
  }

  async function sendMessage() {
    if (!apiKey || !draft.trim() || !modelId) return;
    if (!modelIsChat) {
      setError(`${model.name} is an ${model.modality} model. Switch to a chat model to send messages.`);
      return;
    }
    if (runsOnGcp && gcpJob?.status && gcpJob.status !== "running") {
      setError(gcpJob.message || "Google Cloud is still starting this model. Wait for Connected, then send.");
      return;
    }
    if (runsOnGcp && !routeModelId.startsWith("custom:")) {
      const started = await ensureGcpFor(modelId);
      if (!started || started.status !== "running") {
        setError("Google Cloud is starting this model. Wait for the connection pill, then send.");
        return;
      }
    }
    if (connection.phase === "offline") {
      setError(connection.detail || "Gateway is offline.");
      return;
    }
    setLoading(true);
    setError("");

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: draft.trim(),
      images: [...images],
      documents: documents.map(d => ({ id: d.id, name: d.name, size: d.size })),
      timestamp: new Date(),
    };
    const assistantMsg: Message = { id: uid(), role: "assistant", content: "", timestamp: new Date() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setDraft("");
    setImages([]);
    setDocuments([]);
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    try {
      posthog.capture("playground_request_started", { model: modelId, has_images: images.length > 0 });

      const res = await fetch("/api/playground/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: routeModelId || modelId,
          messages: buildApiMessages(),
          stream: true,
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
          data_class: dataClass,
          provider: {
            allow_fallbacks: allowFallbacks,
            ...(providerSort !== "default" ? { sort: providerSort } : {}),
            ...(providerOrder.split(",").map((s) => s.trim()).filter(Boolean).length
              ? { order: providerOrder.split(",").map((s) => s.trim()).filter(Boolean) }
              : {}),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(formatGatewayError(data, `Request failed: ${res.status}`));
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
      if (chars === 0) {
        throw new Error("Model returned no text. If this is an embedding or rerank model, switch to a chat model.");
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
    setDocuments([]);
  }

  const gcpReady = !runsOnGcp || gcpJob?.status === "running";
  const canRun = Boolean(
    apiKey &&
    draft.trim() &&
    modelId &&
    modelIsChat &&
    gcpReady &&
    connection.phase !== "offline" &&
    connection.phase !== "deploying" &&
    !loading,
  );
  const connectionColor =
    connection.phase === "connected" ? "var(--green)" :
    connection.phase === "offline" || connection.phase === "bad_key" ? "var(--red)" :
    "var(--brand)";

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>

      {/* ── Toolbar ── */}
      <div style={{
        minHeight: 56, borderBottom: "1px solid var(--line)",
        background: "var(--paper-2)", display: "flex", alignItems: "center",
        flexWrap: "wrap", padding: "8px 16px", gap: 8, flexShrink: 0, zIndex: 10,
      }}>
        <div className="od-eyebrow" style={{ marginRight: 4 }}>Playground</div>
        <Link
          href="/dashboard/playground/media"
          style={{ fontSize: 12, color: "var(--ink-3)", textDecoration: "none", marginRight: 4 }}
        >
          Media
        </Link>
        <div style={{ width: 1, height: 20, background: "var(--line)" }} />

        {catalogLoading ? (
          <span className="od-mono" style={{ fontSize: 12, color: "var(--ink-4)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> Loading catalog…
          </span>
        ) : (
          <ModelPicker value={modelId} onChange={handleSelectModel} models={catalog} />
        )}
        {!modelIsChat && model.id && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "var(--red-soft)", color: "var(--red)", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
            {model.modality} — pick a chat model
          </div>
        )}

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
        {modelSupportsDocs && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "var(--paper-3)", color: "var(--ink-2)", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
            <Paperclip style={{ width: 11, height: 11 }} /> Documents
          </div>
        )}
        {modelHasNativeDocs && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "var(--blue-soft)", color: "var(--blue)", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
            <Sparkles style={{ width: 11, height: 11 }} /> Native file APIs
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "var(--paper-3)", color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
          <Zap style={{ width: 11, height: 11 }} /> {model.context}
        </div>

        <div style={{ flex: "1 1 12px", minWidth: 8 }} />

        <button
          type="button"
          onClick={() => void probeConnection(apiKey)}
          title={connection.detail}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "5px 12px", borderRadius: 999, border: "1px solid var(--line)",
            background: "var(--paper)", fontSize: 12, color: "var(--ink-2)", cursor: "pointer",
            maxWidth: 280,
          }}
        >
          {connection.phase === "loading" ? (
            <Loader2 style={{ width: 12, height: 12, color: connectionColor }} className="animate-spin" />
          ) : (
            <span style={{ width: 8, height: 8, borderRadius: 999, background: connectionColor, flexShrink: 0 }} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {connection.phase === "connected"
              ? `Connected${connection.latencyMs != null ? ` · ${connection.latencyMs}ms` : ""}${runsOnGcp ? " · GCP" : ""}`
              : connection.phase === "offline"
                ? "Gateway offline"
                : connection.phase === "bad_key"
                  ? "Refreshing key…"
                  : connection.phase === "deploying"
                    ? "Starting on Google Cloud…"
                    : "Loading connection…"}
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 12 }}>
          <Cpu style={{ width: 12, height: 12, color: "var(--ink-3)" }} />
          <input
            type="password"
            value={apiKey}
            onChange={e => {
              setApiKey(e.target.value);
              if (e.target.value) localStorage.setItem(PLAYGROUND_KEY, e.target.value);
            }}
            placeholder="API key…"
            title={apiKey ? "Playground key stored in this browser" : "Creating a Playground key…"}
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "var(--ink)", fontFamily: "var(--font-mono)", width: 140 }}
          />
        </div>

        <button
          onClick={() => setShowParams(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 999,
            border: `1px solid ${showParams ? "var(--brand)" : "var(--line)"}`,
            background: showParams ? "var(--brand-soft)" : "var(--paper-2)",
            color: showParams ? "var(--brand-deep)" : "var(--ink-2)",
            fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.18s",
          }}
        >
          <SlidersHorizontal style={{ width: 13, height: 13 }} /> Params
        </button>
        <button
          onClick={() => setShowCode(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 999,
            border: `1px solid ${showCode ? "var(--brand)" : "var(--line)"}`,
            background: showCode ? "var(--brand-soft)" : "var(--paper-2)",
            color: showCode ? "var(--brand-deep)" : "var(--ink-2)",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}
        >
          <Code2 style={{ width: 13, height: 13 }} /> View code
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
          disabled={!canRun}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 999,
            background: canRun ? "var(--brand)" : "var(--paper-3)",
            color: canRun ? "white" : "var(--ink-4)",
            border: "none", fontSize: 13, fontWeight: 500, cursor: canRun ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >
          {loading ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Send style={{ width: 14, height: 14 }} />}
          {loading ? "Connecting…" : "Run"}
          {!loading && <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", opacity: 0.7 }}>⌘↵</span>}
        </button>
      </div>

      {(connection.phase === "loading" || connection.phase === "offline" || connection.phase === "bad_key" || connection.phase === "deploying" || !modelIsChat) && (
        <div style={{
          padding: "10px 20px", borderBottom: "1px solid var(--line)", fontSize: 13,
          background: connection.phase === "offline" || !modelIsChat ? "var(--red-soft)" : "var(--paper)",
          color: connection.phase === "offline" || !modelIsChat ? "var(--red)" : "var(--ink-2)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {(connection.phase === "loading" || connection.phase === "deploying") && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
          {connection.phase === "loading" && (connection.detail || "Loading connection — checking the gateway, preparing your key, and selecting a chat model.")}
          {connection.phase === "deploying" && (
            <span>
              {gcpJob?.message || connection.detail || "Starting this model on Google Cloud (Cloud Run GPU). Chat unlocks when the service is up."}
            </span>
          )}
          {connection.phase === "offline" && (
            <span>
              {connection.detail}
            </span>
          )}
          {connection.phase === "bad_key" && (connection.detail || "Refreshing the playground key…")}
          {connection.phase !== "loading" && connection.phase !== "offline" && connection.phase !== "bad_key" && connection.phase !== "deploying" && !modelIsChat && (
            <span>{model.name} cannot chat. Choose a completion model from the picker.</span>
          )}
        </div>
      )}
      {!catalogLoading && catalog.length === 0 && (
        <div style={{ padding: "10px 20px", background: "var(--paper)", borderBottom: "1px solid var(--line)", fontSize: 13, color: "var(--ink-2)" }}>
          No live models in the catalog.{" "}
          <Link href="/dashboard/models" style={{ color: "var(--brand)", fontWeight: 500 }}>Open models</Link>
          {" "}to see what is seeded, or ingest open-weight models.
        </div>
      )}

      {/* ── Main split ── */}
      <div
        style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", overflow: "hidden", userSelect: isDragging ? "none" : "auto" }}
      >
        {showParams && (
          <aside
            style={{
              width: 240,
              minWidth: 220,
              maxWidth: 260,
              flexShrink: 0,
              borderRight: "1px solid var(--line)",
              background: "var(--paper-2)",
              overflowY: "auto",
              overflowX: "hidden",
              padding: "18px 16px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 22,
              boxSizing: "border-box",
            }}
          >
            <div>
              <div className="od-eyebrow" style={{ marginBottom: 8 }}>System prompt</div>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={5}
                style={{
                  width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 12, border: "1px solid var(--line)", outline: "none",
                  background: "var(--paper)", fontFamily: "var(--font-mono)", fontSize: 12,
                  color: "var(--ink-2)", resize: "vertical", lineHeight: 1.6, borderRadius: 12,
                }}
                placeholder="How the model should behave…"
              />
            </div>
            <div>
              <div className="od-eyebrow" style={{ marginBottom: 12 }}>Parameters</div>
              <ParamsPanel temperature={temperature} setTemperature={setTemperature}
                maxTokens={maxTokens} setMaxTokens={setMaxTokens}
                topP={topP} setTopP={setTopP}
                dataClass={dataClass} setDataClass={setDataClass}
                providerSort={providerSort} setProviderSort={setProviderSort}
                allowFallbacks={allowFallbacks} setAllowFallbacks={setAllowFallbacks}
                providerOrder={providerOrder} setProviderOrder={setProviderOrder} />
            </div>
            <div>
              <div className="od-eyebrow" style={{ marginBottom: 8 }}>Response format</div>
              <div style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, color: "var(--ink-2)" }}>
                Text
              </div>
            </div>
          </aside>
        )}

        <div
          ref={containerRef}
          style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", overflow: "hidden" }}
        >
        {/* Left: chat panel */}
        <div style={{ width: `${splitPct}%`, minWidth: 280, display: "flex", flexDirection: "column", borderRight: "1px solid var(--line)", overflow: "hidden" }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
            {messages.length === 0 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--ink-4)", textAlign: "center", padding: 32 }}>
                <div style={{ width: 48, height: 48, borderRadius: 999, background: "var(--brand-soft)", display: "grid", placeItems: "center" }}>
                  <MessageSquare style={{ width: 22, height: 22, color: "var(--brand)" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-3)" }}>Start a conversation</div>
                <div style={{ fontSize: 12, color: "var(--ink-4)", maxWidth: 240 }}>
                  {connection.phase === "loading"
                    ? "Loading connection to the gateway…"
                    : connection.phase === "offline"
                      ? "Gateway is offline — chat will work once it is up."
                      : !modelIsChat
                        ? "This model is embeddings-only. Pick a chat model above."
                        : model.vision ? "You can attach images to your messages." : "Type a message and press ⌘↵ to send."}
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
          {/* Document previews */}
          {documents.length > 0 && (
            <div style={{ display: "flex", gap: 8, padding: "8px 16px", flexWrap: "wrap" }}>
              {documents.map((doc) => (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", background: "var(--paper)", borderRadius: 8, padding: "6px 8px" }}>
                  <Paperclip style={{ width: 12, height: 12, color: "var(--ink-3)" }} />
                  <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                    <span style={{ fontSize: 11, color: "var(--ink-2)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</span>
                    <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
                      {(doc.size / 1024).toFixed(0)} KB{doc.truncated ? " · truncated" : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => setDocuments(prev => prev.filter(d => d.id !== doc.id))}
                    style={{ width: 18, height: 18, borderRadius: 999, background: "var(--ink)", color: "white", border: "none", cursor: "pointer", display: "grid", placeItems: "center" }}
                    title="Remove document"
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
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {dragOver && (
              <div style={{ position: "absolute", inset: 0, background: "var(--brand-soft)", display: "grid", placeItems: "center", borderRadius: 8, zIndex: 5, pointerEvents: "none", border: "2px dashed var(--brand)" }}>
                <div style={{ color: "var(--brand)", fontWeight: 600, fontSize: 14 }}>
                  Drop files here
                </div>
              </div>
            )}
            <div className="od-composer">
              <input
                ref={docInputRef}
                type="file"
                accept={SUPPORTED_DOC_EXTENSIONS.join(",")}
                multiple
                style={{ display: "none" }}
                onChange={e => void handleDocumentFiles(e.target.files)}
              />
              <button
                onClick={() => docInputRef.current?.click()}
                title="Attach document"
                style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 999, border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", flexShrink: 0 }}
                className="hover:text-[var(--brand)]"
              >
                <Paperclip style={{ width: 15, height: 15 }} />
              </button>
              {model.vision && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleImageFiles(e.target.files)} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image"
                    style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 999, border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", flexShrink: 0 }}
                    className="hover:text-[var(--brand)]"
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
                placeholder="Send a message…"
                style={{
                  flex: 1, border: "none",
                  padding: "8px 4px", resize: "none", outline: "none",
                  fontSize: 14, lineHeight: 1.55, fontFamily: "inherit",
                  color: "var(--ink)", background: "transparent", maxHeight: 160,
                  overflowY: "auto",
                }}
              />
              <button
                className="od-send"
                onClick={sendMessage}
                disabled={!canRun}
              >
                {loading
                  ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                  : <Send style={{ width: 14, height: 14 }} />}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
              {modelHasNativeDocs
                ? "Model supports native document workflows. Playground currently sends document text inline with your prompt."
                : "Model does not expose native document APIs here. Uploaded files are sent as extracted text context."}
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
        <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--paper)" }}>
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
          <div style={{ flex: 1, overflowY: "auto", padding: canvasMode === "code" || showCode ? 0 : 32 }}>
            {showCode && (
              <pre className="od-code" style={{ margin: 0, height: "100%", borderRadius: 0 }}>
{`curl ${gatewayUrl}/v1/chat/completions \\
  -H "Authorization: Bearer $OPENDOOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-Data-Class: ${dataClass}" \\
  -d '{
    "model": "${modelId}",
    "temperature": ${temperature},
    "max_tokens": ${maxTokens},
    "top_p": ${topP},
    "provider": ${JSON.stringify({
      allow_fallbacks: allowFallbacks,
      ...(providerSort !== "default" ? { sort: providerSort } : {}),
      ...(providerOrder.split(",").map((s) => s.trim()).filter(Boolean).length
        ? { order: providerOrder.split(",").map((s) => s.trim()).filter(Boolean) }
        : {}),
    })},
    "messages": [
      {"role": "system", "content": ${JSON.stringify(systemPrompt)}},
      {"role": "user", "content": "Hello"}
    ]
  }'`}
              </pre>
            )}
            {!showCode && !canvasText && (
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

            {!showCode && canvasText && <RenderContent text={canvasText} mode={canvasMode} />}
          </div>

          {/* Canvas footer: token count */}
          {!showCode && canvasText && (
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

export default function PlaygroundRoute() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: "var(--ink-3)" }}>Loading playground…</div>}>
      <PlaygroundPage />
    </Suspense>
  );
}
