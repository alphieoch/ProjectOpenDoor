"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bot, Plus, Copy, Check, Globe, Lock, Users, Shield,
  Pencil, Trash2, Radio, Loader2, ExternalLink,
  Upload, FileText, X, Search, LinkIcon, Info, Eye,
  Server, FileCheck, AlertTriangle, Plug, Zap, ChevronDown, ChevronUp,
  Brain, Microscope, Code, Image, Wallet,
} from "lucide-react";
import { formatUsd } from "@opendoor/shared";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";

/* ── Types ── */
interface AIAssistant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarLetter: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  welcomeMessage: string | null;
  maxMessages: number | null;
  visibility: string | null;
  monetization: string | null;
  priceCents: number | null;
  sellerEarningsCents: number | null;
  usageMode: string | null;
  cooldownMinutes: number | null;
  periodWindow: string | null;
  periodMessageLimit: number | null;
  weeklyMessageLimit: number | null;
  publishedAt: string | null;
  passwordProtected: boolean | null;
  deepThinkingEnabled: boolean | null;
  webSearchEnabled: boolean | null;
  researchAgentEnabled: boolean | null;
  codeExecutionEnabled: boolean | null;
  imageGenerationEnabled: boolean | null;
  mcpServers: { id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; enabled: boolean }[] | null;
  createdAt: string;
}

interface AssistantDocument {
  id: string;
  name: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  status: string;
  createdAt: string;
}

interface AssistantConnectionTool {
  id: string;
  connectionId: string;
  toolSlug: string;
  toolName: string | null;
}

interface AssistantConnection {
  id: string;
  appSlug: string;
  appName: string | null;
  appLogo: string | null;
  status: string;
  tools?: AssistantConnectionTool[];
}

interface ComposioApp {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  actionsCount: number | null;
}

interface ComposioTool {
  slug: string;
  name: string;
  description: string | null;
  toolkit: string;
}

interface ApiEndpoint {
  name: string;
  method: string;
  path: string;
  description: string;
  enabled: boolean;
  parameters?: { name: string; type: string; required: boolean; location: "query" | "path" | "body" }[];
}

interface ApiConnection {
  id: string;
  name: string;
  baseUrl: string;
  authType: "bearer" | "api_key" | "header";
  apiKeyHeader: string;
  docsUrl: string;
  enabled: boolean;
  endpoints?: ApiEndpoint[];
}

/* ── Constants ── */
type CatalogOption = { id: string; label: string; provider: string };

const COLORS = ["#1A73E8", "#7C3AED", "#059669", "#DC2626", "#D97706", "#0891B2", "#374151"];

const defaultForm = {
  name: "", slug: "", description: "",
  avatarLetter: "", logoUrl: "", primaryColor: "#1A73E8",
  modelId: "", systemPrompt: "", welcomeMessage: "",
  maxMessages: "100", visibility: "private",
  monetization: "free", priceCents: "", sellerEarningsCents: "",
  usageMode: "included" as "included" | "metered",
  cooldownMinutes: "",
  periodWindow: "" as "15min" | "hourly" | "4hour" | "8hour" | "12hour" | "daily" | "weekly" | "",
  periodMessageLimit: "",
  weeklyMessageLimit: "",
  maxTokensPerSession: "",
  maxTokensPerPeriod: "",
  maxTokensPerMessage: "",
  costCapCents: "",
  meteredPricePerMessageCents: "",
  meteredPricePer1kTokensCents: "",
  deepThinkingEnabled: false,
  webSearchEnabled: false,
  researchAgentEnabled: false,
  codeExecutionEnabled: false,
  imageGenerationEnabled: false,
  passwordProtected: false, password: "",
  mcpServers: [] as { id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; enabled: boolean }[],
};

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function VisibilityIcon({ v }: { v: string | null }) {
  if (v === "public") return <Globe className="h-3.5 w-3.5" />;
  if (v === "team")   return <Users className="h-3.5 w-3.5" />;
  return <Lock className="h-3.5 w-3.5" />;
}

function Hint({ text }: { text: string }) {
  return (
    <span className="group/hint relative inline-flex" tabIndex={0} aria-label={text}>
      <Info
        className="h-3.5 w-3.5 cursor-help outline-none"
        style={{ color: "var(--ink-4)" }}
        aria-hidden="true"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-[110] mt-1.5 -translate-x-1/2 whitespace-normal rounded-md px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal leading-snug opacity-0 shadow-lg transition-opacity duration-150 group-hover/hint:opacity-100 group-focus/hint:opacity-100"
        style={{ background: "var(--ink)", color: "var(--paper-2)", width: "max-content", maxWidth: 240 }}
      >
        {text}
      </span>
    </span>
  );
}

function Label({ children, sub, hint }: { children: React.ReactNode; sub?: React.ReactNode; hint?: string }) {
  return (
    <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--ink)" }}>
      <span>{children}</span>
      {hint && <Hint text={hint} />}
      {sub && <span className="ml-1 font-normal text-xs" style={{ color: "var(--ink-3)" }}>{sub}</span>}
    </label>
  );
}

function SectionHead({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--ink-4)" }}>
      <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      <span className="inline-flex items-center gap-1.5">
        {children}
        {hint && <Hint text={hint} />}
      </span>
      <span className="h-px flex-1" style={{ background: "var(--line)" }} />
    </p>
  );
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Page ── */
export default function AIAssistantsPage() {
  const [assistants, setAssistants] = useState<AIAssistant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<AIAssistant | null>(null);
  const [form, setForm]             = useState(defaultForm);
  const [saving, setSaving]         = useState(false);
  const [copied, setCopied]         = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  // Delete confirmation
  const [assistantToDelete, setAssistantToDelete] = useState<AIAssistant | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Terms & Conditions
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [termsCheckbox, setTermsCheckbox] = useState(false);

  // Available models (fetched from API)
  const [availableModels, setAvailableModels] = useState<CatalogOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Pricing preview for monetization
  const [pricingPreview, setPricingPreview] = useState<{
    earningsCents: number;
    platformFeeCents: number;
    platformFeePercent: number;
    stripeFeeCents: number;
    stripeFeeRate: string;
    buyerTotalCents: number;
    aiCostCents: number;
    profitCents: number;
    pricingFound?: boolean;
  } | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  const [billing, setBilling] = useState<{
    includedQuotaCents: number;
    prepaidCreditsUsdCents: number;
    includedMonthlyCents: number;
    cutOff: boolean;
    welcomeCreditsUsdCents: number;
  } | null>(null);
  const [webSearchAddon, setWebSearchAddon] = useState<{
    active: boolean;
    amountUsd: number;
    configured: boolean;
  } | null>(null);

  // Logo upload
  const logoInputRef  = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // Documents (only used when editing)
  const [documents, setDocuments]       = useState<AssistantDocument[]>([]);
  const [docsLoading, setDocsLoading]   = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver]         = useState(false);

  // Composio integrations
  const [connections, setConnections]       = useState<AssistantConnection[]>([]);
  const [composioApps, setComposioApps]     = useState<ComposioApp[]>([]);
  const [appsLoading, setAppsLoading]       = useState(false);
  const [appSearch, setAppSearch]           = useState("");
  const [connecting, setConnecting]         = useState<string | null>(null);
  const [pollRef, setPollRef]               = useState<ReturnType<typeof setInterval> | null>(null);

  // Tool selection panel
  const [toolPanelApp, setToolPanelApp]     = useState<ComposioApp | null>(null);
  const [appTools, setAppTools]             = useState<ComposioTool[]>([]);
  const [toolsLoading, setToolsLoading]     = useState(false);
  const [selectedToolSlugs, setSelectedToolSlugs] = useState<Set<string>>(new Set());

  // API connections
  const [apiConnections, setApiConnections] = useState<ApiConnection[]>([]);
  const [apiConnLoading, setApiConnLoading] = useState(false);
  const [apiConnAdding, setApiConnAdding]   = useState(false);
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null);
  const [apiConnForm, setApiConnForm]       = useState({
    name: "", baseUrl: "", authType: "bearer" as "bearer" | "api_key" | "header",
    apiKey: "", apiKeyHeader: "", docsUrl: "",
  });

  useEffect(() => { load(); loadModels(); loadBilling(); }, []);
  useEffect(() => { return () => { if (pollRef) clearInterval(pollRef); }; }, [pollRef]);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/ai-assistants").then((r) => r.json());
    setAssistants(data.assistants ?? []);
    if (data.webSearchAddon) {
      setWebSearchAddon({
        active: Boolean(data.webSearchAddon.active),
        amountUsd: Number(data.webSearchAddon.amountUsd || 20),
        configured: Boolean(data.webSearchAddon.configured),
      });
    }
    setLoading(false);
  }

  async function loadBilling() {
    try {
      const res = await fetch("/api/billing/balance", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setBilling({
        includedQuotaCents: Number(data.includedQuotaCents || 0),
        prepaidCreditsUsdCents: Number(data.prepaidCreditsUsdCents || 0),
        includedMonthlyCents: Number(data.includedMonthlyCents || 0),
        cutOff: Boolean(data.cutOff),
        welcomeCreditsUsdCents: Number(data.welcomeCreditsUsdCents || 0),
      });
    } catch {
      /* billing strip is optional */
    }
  }

  async function loadDocuments(assistantId: string) {
    setDocsLoading(true);
    const data = await fetch(`/api/ai-assistants/${assistantId}/documents`).then((r) => r.json());
    setDocuments(data.documents ?? []);
    setDocsLoading(false);
  }

  async function loadConnections(assistantId: string) {
    try {
      const r = await fetch(`/api/ai-assistants/${assistantId}/connections`);
      if (!r.ok) { setConnections([]); return; }
      const data = await r.json();
      setConnections(data.connections ?? []);
    } catch {
      setConnections([]);
    }
  }

  async function loadApiConnections(assistantId: string) {
    setApiConnLoading(true);
    try {
      const r = await fetch(`/api/ai-assistants/${assistantId}/api-connections`);
      if (!r.ok) { setApiConnections([]); return; }
      const data = await r.json();
      setApiConnections(data.connections ?? []);
    } catch {
      setApiConnections([]);
    } finally {
      setApiConnLoading(false);
    }
  }

  async function addApiConnection() {
    if (!editing) return;
    const { name, baseUrl, authType, apiKey, apiKeyHeader, docsUrl } = apiConnForm;
    if (!name || !baseUrl || !apiKey || !docsUrl) {
      alert("Please fill in name, base URL, API key, and docs URL.");
      return;
    }
    setApiConnAdding(true);
    try {
      const r = await fetch(`/api/ai-assistants/${editing.id}/api-connections/auto-configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, baseUrl, authType, apiKey, apiKeyHeader, docsUrl }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(data.error || "Failed to add API connection");
        return;
      }
      setApiConnections((prev) => [...prev, data.connection]);
      setApiConnForm({ name: "", baseUrl: "", authType: "bearer", apiKey: "", apiKeyHeader: "", docsUrl: "" });
    } catch (err: any) {
      alert(err.message || "Failed to add API connection");
    } finally {
      setApiConnAdding(false);
    }
  }

  async function deleteApiConnection(connectionId: string) {
    if (!editing) return;
    if (!confirm("Delete this API connection? The associated secret will also be removed.")) return;
    const r = await fetch(`/api/ai-assistants/${editing.id}/api-connections?connectionId=${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
    });
    if (r.ok) {
      setApiConnections((prev) => prev.filter((c) => c.id !== connectionId));
    } else {
      const data = await r.json().catch(() => ({ error: "Unknown error" }));
      alert(data.error || "Failed to delete");
    }
  }

  async function toggleApiConnection(connectionId: string) {
    if (!editing) return;
    const conn = apiConnections.find((c) => c.id === connectionId);
    if (!conn) return;
    const next = apiConnections.map((c) => (c.id === connectionId ? { ...c, enabled: !c.enabled } : c));
    setApiConnections(next);
    await fetch(`/api/ai-assistants/${editing.id}/api-connections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, enabled: !conn.enabled }),
    });
  }

  async function toggleEndpoint(connectionId: string, endpointIdx: number) {
    if (!editing) return;
    const conn = apiConnections.find((c) => c.id === connectionId);
    if (!conn?.endpoints) return;
    const nextEndpoints = conn.endpoints.map((ep, i) =>
      i === endpointIdx ? { ...ep, enabled: !ep.enabled } : ep
    );
    const next = apiConnections.map((c) =>
      c.id === connectionId ? { ...c, endpoints: nextEndpoints } : c
    );
    setApiConnections(next);
    await fetch(`/api/ai-assistants/${editing.id}/api-connections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, endpoints: nextEndpoints }),
    });
  }

  async function loadApps(search = "") {
    setAppsLoading(true);
    try {
      const url = `/api/composio/apps${search ? `?search=${encodeURIComponent(search)}` : ""}`;
      const r = await fetch(url);
      if (!r.ok) {
        setComposioApps([]);
        return;
      }
      const data = await r.json();
      setComposioApps(data.apps ?? []);
    } catch {
      setComposioApps([]);
    } finally {
      setAppsLoading(false);
    }
  }

  async function loadAppTools(appSlug: string) {
    setToolsLoading(true);
    try {
      const r = await fetch(`/api/composio/apps/${encodeURIComponent(appSlug)}/tools`);
      if (!r.ok) { setAppTools([]); return; }
      const data = await r.json();
      setAppTools(data.tools ?? []);
    } catch {
      setAppTools([]);
    } finally {
      setToolsLoading(false);
    }
  }

  function openToolPanel(app: ComposioApp) {
    setToolPanelApp(app);
    setAppTools([]);
    setSelectedToolSlugs(new Set());
    loadAppTools(app.slug);
    // Pre-select existing tools for this connection
    const conn = connections.find((c) => c.appSlug === app.slug);
    if (conn?.tools && conn.tools.length > 0) {
      setSelectedToolSlugs(new Set(conn.tools.map((t) => t.toolSlug)));
    }
  }

  async function connectApp(app: ComposioApp, toolSlugs?: string[]) {
    if (!editing) return;
    setConnecting(app.slug);
    const res = await fetch(`/api/ai-assistants/${editing.id}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appSlug: app.slug,
        appName: app.name,
        appLogo: app.logo,
        toolSlugs: toolSlugs ?? [],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      console.error("Connect failed:", err);
      alert(err.error ?? "Failed to connect app");
      setConnecting(null);
      return;
    }
    const json = await res.json();
    if (json.redirectUrl) {
      window.open(json.redirectUrl, "_blank", "width=600,height=700");
      // Poll for connection becoming active
      const interval = setInterval(async () => {
        let updated: AssistantConnection[] = [];
        try {
          const pollRes = await fetch(`/api/ai-assistants/${editing.id}/connections`);
          if (!pollRes.ok) return;
          const data = await pollRes.json();
          updated = data.connections ?? [];
          setConnections(updated);
        } catch { /* ignore polling errors */ }
        const conn = updated.find((c: AssistantConnection) => c.appSlug === app.slug);
        if (conn?.status === "active") {
          clearInterval(interval);
          setConnecting(null);
        }
      }, 3000);
      setPollRef(interval);
      // Stop polling after 2 minutes
      setTimeout(() => { clearInterval(interval); setConnecting(null); }, 120_000);
    } else {
      // API-key app or already connected — refresh immediately
      await loadConnections(editing.id);
      setConnecting(null);
    }
  }

  async function disconnectApp(appSlug: string) {
    if (!editing) return;
    await fetch(`/api/ai-assistants/${editing.id}/connections/${appSlug}`, { method: "DELETE" });
    setConnections((prev) => prev.filter((c) => c.appSlug !== appSlug));
  }

  async function loadModels(preferredId?: string) {
    setModelsLoading(true);
    try {
      const res = await fetch("/api/models/available");
      const data = res.ok ? await res.json() : { models: [] };
      const rows = (data.models || []) as CatalogOption[];
      setAvailableModels(rows);
      setForm((prev) => {
        if (preferredId && rows.some((m) => m.id === preferredId)) {
          return { ...prev, modelId: preferredId };
        }
        if (rows.some((m) => m.id === prev.modelId)) return prev;
        return { ...prev, modelId: rows[0]?.id || "" };
      });
    } catch (err) {
      console.error("Failed to load models:", err);
      setAvailableModels([]);
    }
    setModelsLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setDocuments([]);
    setConnections([]);
    setComposioApps([]);
    setAppSearch("");
    setTermsAccepted(false);
    setTermsCheckbox(false);
    loadModels();
    setDialogOpen(true);
  }

  function openEdit(a: AIAssistant) {
    setEditing(a);
    setForm({
      name: a.name, slug: a.slug, description: a.description ?? "",
      avatarLetter: a.avatarLetter ?? "", logoUrl: a.logoUrl ?? "",
      primaryColor: a.primaryColor ?? "#1A73E8",
      modelId: a.modelId ?? "", systemPrompt: a.systemPrompt ?? "",
      welcomeMessage: a.welcomeMessage ?? "", maxMessages: a.maxMessages?.toString() ?? "",
      visibility: a.visibility ?? "private", monetization: a.monetization ?? "free",
      priceCents: a.priceCents ? (a.priceCents / 100).toString() : "",
      sellerEarningsCents: a.sellerEarningsCents ? (a.sellerEarningsCents / 100).toString() : "",
      usageMode: (a.usageMode as "included" | "metered") ?? "included",
      cooldownMinutes: a.cooldownMinutes?.toString() ?? "",
      periodWindow: (a.periodWindow ?? "") as any,
      periodMessageLimit: a.periodMessageLimit?.toString() ?? "",
      weeklyMessageLimit: a.weeklyMessageLimit?.toString() ?? "",
      maxTokensPerSession: (a as any).maxTokensPerSession?.toString() ?? "",
      maxTokensPerPeriod: (a as any).maxTokensPerPeriod?.toString() ?? "",
      maxTokensPerMessage: (a as any).maxTokensPerMessage?.toString() ?? "",
      costCapCents: (a as any).costCapCents ? ((a as any).costCapCents / 100).toString() : "",
      meteredPricePerMessageCents: (a as any).meteredPricePerMessageCents ? ((a as any).meteredPricePerMessageCents / 100).toString() : "",
      meteredPricePer1kTokensCents: (a as any).meteredPricePer1kTokensCents ? ((a as any).meteredPricePer1kTokensCents / 100).toString() : "",
      deepThinkingEnabled: a.deepThinkingEnabled ?? false,
      webSearchEnabled: a.webSearchEnabled ?? false,
      researchAgentEnabled: a.researchAgentEnabled ?? false,
      codeExecutionEnabled: a.codeExecutionEnabled ?? false,
      imageGenerationEnabled: a.imageGenerationEnabled ?? false,
      passwordProtected: a.passwordProtected ?? false,
      password: "",
      mcpServers: a.mcpServers ?? [],
    });
    if (a.monetization && a.monetization !== "free" && a.sellerEarningsCents != null) {
      setTimeout(() => fetchPricingPreview((a.sellerEarningsCents! / 100).toString()), 0);
    }
    loadDocuments(a.id);
    loadConnections(a.id);
    loadApiConnections(a.id);
    loadApps();
    loadModels(a.modelId ?? undefined);
    setDialogOpen(true);
  }

  /* ── Logo upload ── */
  async function handleLogoFile(file: File) {
    setLogoUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/assistant-logo", { method: "POST", body: fd });
    const json = await res.json();
    if (json.url) set("logoUrl", json.url);
    setLogoUploading(false);
  }

  /* ── Document upload ── */
  async function handleDocFiles(files: FileList | File[]) {
    if (!editing) return;
    for (const file of Array.from(files)) {
      setDocUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/ai-assistants/${editing.id}/documents`, { method: "POST", body: fd });
      const json = await res.json();
      if (json.document) setDocuments((prev) => [...prev, json.document]);
      setDocUploading(false);
    }
  }

  async function deleteDocument(docId: string) {
    if (!editing) return;
    await fetch(`/api/ai-assistants/${editing.id}/documents/${docId}`, { method: "DELETE" });
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  }

  async function fetchPricingPreview(earningsPounds: string) {
    const earningsCents = earningsPounds ? Math.round(parseFloat(earningsPounds) * 100) : 0;
    if (earningsCents <= 0) {
      setPricingPreview(null);
      return;
    }
    setPricingLoading(true);
    try {
      const maxMessages = parseInt(f.maxMessages) || 20;
      const res = await fetch("/api/ai-assistants/pricing-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ earningsCents, modelId: f.modelId, maxMessages, usageMode: f.usageMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setPricingPreview(data);
        // Update priceCents (buyer total) in form
        if (data.buyerTotalCents > 0) {
          setForm((p) => ({ ...p, priceCents: (data.buyerTotalCents / 100).toFixed(2) }));
        }
      }
    } catch (err) {
      console.error("Pricing preview failed:", err);
    }
    setPricingLoading(false);
  }

  async function save() {
    if (!form.name || !form.slug || !form.modelId) return;
    if (form.monetization !== "free" && !termsAccepted) {
      setTermsCheckbox(false);
      setShowTermsDialog(true);
      return;
    }
    setSaving(true);
    const body = {
      ...form,
      avatarLetter: form.avatarLetter || form.name.charAt(0).toUpperCase(),
      logoUrl: form.logoUrl || null,
      priceCents: form.priceCents ? Math.round(parseFloat(form.priceCents) * 100) : 0,
      sellerEarningsCents: form.sellerEarningsCents ? Math.round(parseFloat(form.sellerEarningsCents) * 100) : 0,
      maxMessages: form.maxMessages ? parseInt(form.maxMessages) : null,
      cooldownMinutes: form.cooldownMinutes ? parseInt(form.cooldownMinutes) : null,
      periodWindow: form.periodWindow || null,
      periodMessageLimit: form.periodMessageLimit ? parseInt(form.periodMessageLimit) : null,
      weeklyMessageLimit: form.weeklyMessageLimit ? parseInt(form.weeklyMessageLimit) : null,
      maxTokensPerSession: form.maxTokensPerSession ? parseInt(form.maxTokensPerSession) : null,
      maxTokensPerPeriod: form.maxTokensPerPeriod ? parseInt(form.maxTokensPerPeriod) : null,
      maxTokensPerMessage: form.maxTokensPerMessage ? parseInt(form.maxTokensPerMessage) : null,
      costCapCents: form.costCapCents ? Math.round(parseFloat(form.costCapCents) * 100) : null,
      meteredPricePerMessageCents: form.meteredPricePerMessageCents ? Math.round(parseFloat(form.meteredPricePerMessageCents) * 100) : null,
      meteredPricePer1kTokensCents: form.meteredPricePer1kTokensCents ? Math.round(parseFloat(form.meteredPricePer1kTokensCents) * 100) : null,
      deepThinkingEnabled: form.deepThinkingEnabled,
      webSearchEnabled: webSearchAddon && !webSearchAddon.active ? false : form.webSearchEnabled,
      researchAgentEnabled: form.researchAgentEnabled,
      codeExecutionEnabled: form.codeExecutionEnabled,
      imageGenerationEnabled: form.imageGenerationEnabled,
      passwordProtected: form.passwordProtected,
      password: form.passwordProtected ? form.password : undefined,
      mcpServers: form.mcpServers,
    };
    if (editing) {
      await fetch(`/api/ai-assistants/${editing.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/ai-assistants", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  }

  async function togglePublish(a: AIAssistant) {
    if (a.visibility !== "public" && !a.publishedAt) {
      alert("Set visibility to Public before publishing.");
      return;
    }
    setPublishing(a.id);
    await fetch(`/api/ai-assistants/${a.id}/publish`, { method: "POST" });
    setPublishing(null);
    load();
  }

  function requestDelete(a: AIAssistant) {
    setAssistantToDelete(a);
    setDeleteConfirmText("");
  }

  function cancelDelete() {
    if (deleting) return;
    setAssistantToDelete(null);
    setDeleteConfirmText("");
  }

  async function confirmDelete() {
    if (!assistantToDelete) return;
    if (deleteConfirmText.trim() !== assistantToDelete.name) return;
    setDeleting(true);
    try {
      await fetch(`/api/ai-assistants/${assistantToDelete.id}`, { method: "DELETE" });
      setAssistantToDelete(null);
      setDeleteConfirmText("");
      load();
    } finally {
      setDeleting(false);
    }
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/ai/${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  }

  const f = form;
  const set = (k: keyof typeof defaultForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const previewColor  = f.primaryColor || "#1A73E8";
  const previewLetter = f.avatarLetter || f.name.charAt(0).toUpperCase() || "A";

  return (
    <div>
      <PageHeader
        eyebrow="Build"
        title="AI Assistants"
        description="Create, brand, and publish AI assistants. Chats use included credit first, then prepaid, and stop at $0."
        actions={
          <button onClick={openCreate} className="btn-primary shrink-0">
            <Plus className="h-4 w-4" /> Create assistant
          </button>
        }
      />

      {billing && (
        <div
          className="mb-6 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{
            borderColor: billing.cutOff ? "var(--red)" : "var(--line)",
            background: billing.cutOff ? "var(--red-soft)" : "var(--paper-2)",
          }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0" style={{ color: billing.cutOff ? "var(--red)" : "var(--ink-3)" }} />
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: billing.cutOff ? "var(--red)" : "var(--ink)" }}>
                {billing.cutOff
                  ? billing.welcomeCreditsUsdCents > 0
                    ? "Included credit and prepaid are used up"
                    : "Assistants are paused — included credit and prepaid are used up"
                  : "Every chat bills this workspace"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: billing.cutOff ? "var(--red)" : "var(--ink-3)" }}>
                {billing.cutOff
                  ? billing.welcomeCreditsUsdCents > 0
                    ? `Closed models are cut off. ${formatUsd(billing.welcomeCreditsUsdCents)} open-weight bonus can still run until it expires.`
                    : "Users are cut off until you top up prepaid credit on Billing."
                  : `Uses your ${formatUsd(billing.includedMonthlyCents)} included monthly credit first. Overflow draws prepaid. Requests stop when both hit $0.`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <span
              className="rounded-md px-2 py-1 text-xs font-medium tabular-nums"
              style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}
            >
              Included {formatUsd(billing.includedQuotaCents)}
            </span>
            <span
              className="rounded-md px-2 py-1 text-xs font-medium tabular-nums"
              style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}
            >
              Prepaid {formatUsd(billing.prepaidCreditsUsdCents)}
            </span>
            <Link href="/dashboard/billing" className="btn-secondary btn-sm">
              {billing.cutOff ? "Top up to resume" : "Billing"}
            </Link>
          </div>
        </div>
      )}

      {/* List / empty state */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : assistants.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-24 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: "var(--brand-container)" }}>
            <Bot className="h-8 w-8" style={{ color: "var(--brand)" }} />
          </div>
          <div>
            <p className="text-base font-semibold" style={{ color: "var(--ink)" }}>No AI assistants yet</p>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
              Create your first branded AI assistant and publish it to a shareable URL.
            </p>
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4" /> Create assistant
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assistants.map((a) => {
            const color      = a.primaryColor ?? "#1A73E8";
            const live       = !!a.publishedAt;
            const modelLabel = availableModels.find((m) => m.id === a.modelId)?.label ?? a.modelId;
            const letter     = (a.avatarLetter || a.name.charAt(0)).toUpperCase();
            const addedDate  = new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
            return (
              <div
                key={a.id}
                className="flex flex-col overflow-hidden transition-transform duration-150 hover:-translate-y-px"
                style={{
                  background: "var(--md-surface-container-lowest)",
                  border: "1px solid var(--md-outline-variant)",
                  borderRadius: "12px",
                }}
              >
                {/* Main content */}
                <div className="flex flex-1 flex-col gap-3 p-4">

                  {/* Row 1: name + status */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-6 w-6 shrink-0 rounded grid place-items-center text-[11px] font-bold text-white overflow-hidden"
                        style={{ background: color }}
                      >
                        {a.logoUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={a.logoUrl} alt="" className="h-full w-full object-cover" />
                          : letter}
                      </div>
                      <span className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{a.name}</span>
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={live
                        ? { background: "var(--green-soft)", color: "var(--green)" }
                        : { background: "var(--paper-3)", color: "var(--ink-3)" }}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: live ? "var(--green)" : "var(--ink-4)" }}
                      />
                      {live ? "Live" : "Draft"}
                    </span>
                  </div>

                  {/* Row 2: model · slug eyebrow */}
                  <p className="font-mono text-[11px] leading-none" style={{ color: "var(--ink-4)" }}>
                    {modelLabel}
                    <span className="mx-1.5 opacity-30">·</span>
                    /{a.slug}
                  </p>

                  {/* Row 3: description */}
                  <p className="text-xs leading-relaxed line-clamp-2" style={{ color: a.description ? "var(--ink-3)" : "var(--ink-4)" }}>
                    {a.description || <span className="italic">No description</span>}
                  </p>

                  {/* Row 4: metadata */}
                  <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>Access</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium capitalize" style={{ color: "var(--ink-2)" }}>
                        <VisibilityIcon v={a.visibility} /> {a.visibility ?? "private"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--ink-4)" }}>Added</p>
                      <p className="mt-0.5 text-xs font-medium tabular-nums" style={{ color: "var(--ink-2)" }}>{addedDate}</p>
                    </div>
                  </div>
                </div>

                {/* Footer actions */}
                <div
                  className="flex items-center gap-0.5 px-3 py-2"
                  style={{ borderTop: "1px solid var(--md-outline-variant)" }}
                >
                  <button onClick={() => openEdit(a)} className="btn-ghost btn-sm">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  {live && (
                    <>
                      <a
                        href={`/ai/${a.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost btn-sm"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                      <button onClick={() => copyLink(a.slug)} className="btn-ghost btn-sm">
                        {copied === a.slug ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === a.slug ? "Copied" : "Link"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => togglePublish(a)}
                    disabled={publishing === a.id}
                    className="btn-ghost btn-sm ml-auto"
                    style={{ color: live ? "var(--ink-3)" : "var(--brand)" }}
                  >
                    {publishing === a.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Radio className="h-3.5 w-3.5" />}
                    {live ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => requestDelete(a)}
                    className="btn-ghost btn-sm"
                    style={{ color: "var(--red)" }}
                    title={`Delete ${a.name}`}
                    aria-label={`Delete ${a.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">

          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Live preview avatar */}
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl overflow-hidden text-sm font-bold text-white transition-all"
                  style={{ background: previewColor }}
                >
                  {f.logoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={f.logoUrl} alt="logo" className="h-full w-full object-cover" />
                    : previewLetter}
                </div>
                <DialogTitle>{editing ? "Edit assistant" : "Create AI assistant"}</DialogTitle>
              </div>
              {editing && (
                <a
                  href={`/ai/${editing.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                  style={{ color: "var(--brand)" }}
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </a>
              )}
            </div>
          </DialogHeader>

          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

            {/* ── Basics ── */}
            <section>
              <SectionHead hint="Identity and branding shown to anyone who chats with this assistant.">Basics</SectionHead>
              <div className="space-y-4">

                {/* Logo upload */}
                <div>
                  <Label
                    hint="Square image used as the assistant's avatar in the chat UI. Falls back to the first letter of the name when empty."
                    sub="optional — PNG, JPG, WebP, SVG · max 2 MB"
                  >
                    Logo
                  </Label>
                  <div className="flex items-center gap-3">
                    {/* Preview */}
                    <div
                      className="grid h-14 w-14 shrink-0 place-items-center rounded-xl overflow-hidden border-2 transition-all"
                      style={{ borderColor: "var(--line)", background: previewColor }}
                    >
                      {f.logoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={f.logoUrl} alt="logo preview" className="h-full w-full object-cover" />
                        : <span className="text-lg font-bold text-white">{previewLetter}</span>}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                        className="btn-ghost btn-sm"
                      >
                        {logoUploading
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Upload className="h-3.5 w-3.5" />}
                        {logoUploading ? "Uploading…" : "Upload logo"}
                      </button>
                      {f.logoUrl && (
                        <button
                          type="button"
                          onClick={() => set("logoUrl", "")}
                          className="btn-ghost btn-sm"
                          style={{ color: "var(--red)" }}
                        >
                          <X className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </div>

                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      className="sr-only"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label hint="Display name shown in the dashboard list and to anyone chatting with the assistant.">Name *</Label>
                    <input
                      className="input w-full"
                      value={f.name}
                      onChange={(e) => {
                        set("name", e.target.value);
                        if (!editing) set("slug", toSlug(e.target.value));
                      }}
                      placeholder="My Support AI"
                      required
                    />
                  </div>
                  <div>
                    <Label
                      hint="URL-safe identifier. Your assistant will be reachable at /ai/<slug>. Lowercase letters, numbers and dashes only."
                      sub={f.slug ? <span className="font-mono">/ai/{f.slug}</span> : undefined}
                    >
                      Slug *
                    </Label>
                    <input
                      className="input w-full font-mono text-sm"
                      value={f.slug}
                      onChange={(e) => set("slug", toSlug(e.target.value))}
                      placeholder="my-support-ai"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label hint="Short summary shown on the assistant card and in the chat header. Visible to end users.">Description</Label>
                  <textarea
                    className="input w-full"
                    rows={2}
                    value={f.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="What does this assistant do?"
                  />
                </div>

                <div>
                  <Label hint="Accent colour applied to the avatar background and chat highlights. Pick a preset or enter a custom hex.">Brand colour</Label>
                  <div className="flex items-center gap-2.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => set("primaryColor", c)}
                        className="h-7 w-7 rounded-full transition-all hover:scale-110"
                        style={{
                          background: c,
                          outline: f.primaryColor === c ? `3px solid ${c}` : undefined,
                          outlineOffset: f.primaryColor === c ? "2px" : undefined,
                          transform: f.primaryColor === c ? "scale(1.15)" : undefined,
                        }}
                      />
                    ))}
                    <label className="relative h-7 w-7 cursor-pointer" title="Custom colour">
                      <span
                        className="block h-7 w-7 rounded-full border-2 border-dashed transition-all hover:scale-110"
                        style={{ borderColor: "var(--line)", background: COLORS.includes(f.primaryColor) ? "transparent" : f.primaryColor }}
                      />
                      <input type="color" value={f.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className="sr-only" />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Model & Prompt ── */}
            <section>
              <SectionHead hint="Pick the underlying LLM and shape how it responds.">Model &amp; Prompt</SectionHead>
              <div className="space-y-4">
                <div>
                  <Label hint="LLM that powers responses. You can switch later — the system prompt and chat history stay the same.">Model</Label>
                  <Select value={f.modelId || undefined} onValueChange={(v) => {
                    set("modelId", v);
                    if (f.monetization !== "free" && f.sellerEarningsCents) {
                      clearTimeout((window as any).__pricingTimeout);
                      (window as any).__pricingTimeout = setTimeout(() => fetchPricingPreview(f.sellerEarningsCents), 300);
                    }
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={modelsLoading ? "Loading catalog…" : "Select a catalog model"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.length === 0 && !modelsLoading && (
                        <SelectItem value="__empty__" disabled>
                          No catalog models — seed the database
                        </SelectItem>
                      )}
                      {availableModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span>{m.label}</span>
                          <span className="ml-1.5 text-xs opacity-50">({m.provider})</span>
                        </SelectItem>
                      ))}
                      {modelsLoading && (
                        <SelectItem value="__loading__" disabled>
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading models…
                          </span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
                    Inference draws included credit first, then prepaid. The assistant is cut off at $0.
                  </p>
                </div>

                <div>
                  <Label hint="Hidden instructions that define the assistant's role, tone and rules. End users never see this text.">System prompt</Label>
                  <textarea
                    className="input w-full font-mono text-xs leading-relaxed"
                    rows={5}
                    value={f.systemPrompt}
                    onChange={(e) => set("systemPrompt", e.target.value)}
                    placeholder="You are a helpful assistant for..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label hint="First message the assistant sends when a new conversation starts.">Welcome message</Label>
                    <input className="input w-full" value={f.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} placeholder="Hello! How can I help you today?" />
                  </div>
                  <div>
                    <Label
                      hint="Total messages allowed per purchase. When reached, users are blocked unless a cooldown or period limit is configured."
                      sub="leave blank for unlimited"
                    >
                      Session message limit
                    </Label>
                    <input
                      type="number"
                      className="input w-full"
                      value={f.maxMessages}
                      onChange={(e) => {
                        set("maxMessages", e.target.value);
                        if (f.monetization !== "free" && f.sellerEarningsCents) {
                          clearTimeout((window as any).__pricingTimeout);
                          (window as any).__pricingTimeout = setTimeout(() => fetchPricingPreview(f.sellerEarningsCents), 300);
                        }
                      }}
                      placeholder="100"
                      min={1}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ── Access & Pricing ── */}
            <section>
              <SectionHead hint="Choose who can use this assistant and whether you charge for access.">Access &amp; Pricing</SectionHead>
              <div className="space-y-5">
                <div>
                  <Label hint="Who can open this assistant. Private = only you, Team = everyone in your org, Public = anyone with the link.">Visibility</Label>
                  <div className="grid grid-cols-3 gap-3 mt-1.5">
                    {[
                      { value: "private", icon: Lock,  label: "Private", desc: "Only you" },
                      { value: "team",    icon: Users,  label: "Team",    desc: "Your org members" },
                      { value: "public",  icon: Globe,  label: "Public",  desc: "Anyone with the link" },
                    ].map(({ value, icon: Icon, label, desc }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => set("visibility", value)}
                        className={cn(
                          "relative flex flex-col items-center gap-1.5 rounded-xl border p-3.5 text-sm transition-all",
                          f.visibility === value
                            ? "border-[var(--brand)] bg-[var(--brand-container)]"
                            : "border-[var(--line)] hover:bg-[var(--paper-3)]",
                        )}
                      >
                        <Icon className="h-4 w-4" style={{ color: f.visibility === value ? "var(--brand)" : "var(--ink-3)" }} />
                        <span className="font-semibold text-xs" style={{ color: "var(--ink)" }}>{label}</span>
                        <span className="text-xs leading-tight text-center" style={{ color: "var(--ink-3)" }}>{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {f.visibility === "public" && (
                  <div>
                    <Label hint="How end users pay for access. Only available for Public assistants.">Monetization</Label>
                    <div className="grid grid-cols-3 gap-3 mt-1.5">
                      {[
                        { value: "free",        label: "Free",         desc: "No charge"      },
                        { value: "one_time",     label: "One-time",     desc: "Single payment" },
                        { value: "subscription", label: "Subscription", desc: "Monthly"        },
                      ].map(({ value, label, desc }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            set("monetization", value);
                            if (value !== "free") {
                              setTermsAccepted(false);
                              // Set default earnings and trigger preview
                              const defaultEarnings = f.sellerEarningsCents || "10.00";
                              setForm((p) => ({ ...p, sellerEarningsCents: defaultEarnings }));
                              setTimeout(() => fetchPricingPreview(defaultEarnings), 0);
                            } else {
                              setPricingPreview(null);
                            }
                          }}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-xl border p-3.5 text-sm transition-all",
                            f.monetization === value
                              ? "border-[var(--brand)] bg-[var(--brand-container)]"
                              : "border-[var(--line)] hover:bg-[var(--paper-3)]",
                          )}
                        >
                          <span className="font-semibold text-xs" style={{ color: "var(--ink)" }}>{label}</span>
                          <span className="text-xs" style={{ color: "var(--ink-3)" }}>{desc}</span>
                        </button>
                      ))}
                    </div>
                    {f.monetization !== "free" && (
                      <>
                        {/* Usage mode toggle */}
                        <div className="mt-4">
                          <Label hint="All messages included in the price, or charge per extra message beyond the limit.">Usage mode</Label>
                          <div className="grid grid-cols-2 gap-3 mt-1.5">
                            {[
                              { value: "included", label: "All included", desc: "Up to max messages" },
                              { value: "metered", label: "Metered", desc: "Pay per extra msg" },
                            ].map(({ value, label, desc }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => {
                                  setForm((p) => ({ ...p, usageMode: value as "included" | "metered" }));
                                  if (f.sellerEarningsCents) {
                                    setTimeout(() => fetchPricingPreview(f.sellerEarningsCents), 0);
                                  }
                                }}
                                className={cn(
                                  "flex flex-col items-center gap-1 rounded-xl border p-3 text-sm transition-all",
                                  f.usageMode === value
                                    ? "border-[var(--brand)] bg-[var(--brand-container)]"
                                    : "border-[var(--line)] hover:bg-[var(--paper-3)]",
                                )}
                              >
                                <span className="font-semibold text-xs" style={{ color: "var(--ink)" }}>{label}</span>
                                <span className="text-xs" style={{ color: "var(--ink-3)" }}>{desc}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Period limit */}
                        {f.usageMode === "included" && (
                          <div className="mt-4 rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--line)" }}>
                            <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Period limit</p>
                            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                              Like Claude Pro — limit how many messages a user can send in a rolling time window.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label hint="The rolling time window for the period limit.">Window</Label>
                                <select
                                  className="input w-full"
                                  value={f.periodWindow}
                                  onChange={(e) => set("periodWindow", e.target.value)}
                                >
                                  <option value="">No period limit</option>
                                  <option value="15min">15 minutes</option>
                                  <option value="hourly">1 hour</option>
                                  <option value="4hour">4 hours</option>
                                  <option value="8hour">8 hours</option>
                                  <option value="12hour">12 hours</option>
                                  <option value="daily">24 hours</option>
                                  <option value="weekly">7 days</option>
                                </select>
                              </div>
                              <div>
                                <Label hint="Max messages within the period window.">Messages per period</Label>
                                <input
                                  type="number"
                                  className="input w-full"
                                  value={f.periodMessageLimit}
                                  onChange={(e) => set("periodMessageLimit", e.target.value)}
                                  placeholder={f.periodWindow === "15min" ? "5" : f.periodWindow === "hourly" ? "20" : "100"}
                                  min={1}
                                  disabled={!f.periodWindow}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Weekly limit */}
                        {f.usageMode === "included" && (
                          <div className="mt-4 rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--line)" }}>
                            <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Weekly cap</p>
                            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                              An overall weekly message budget on top of other limits. Resets every 7 days.
                            </p>
                            <div>
                              <Label hint="Total messages allowed per 7-day rolling window.">Messages per week</Label>
                              <input
                                type="number"
                                className="input w-36"
                                value={f.weeklyMessageLimit}
                                onChange={(e) => set("weeklyMessageLimit", e.target.value)}
                                placeholder="500"
                                min={1}
                              />
                            </div>
                          </div>
                        )}

                        {/* Token limits */}
                        <div className="mt-4 rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--line)" }}>
                          <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Token limits</p>
                          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                            Prevent buyers from burning through credits with huge messages or expensive loops.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label hint="Max tokens allowed in a single request. Cuts off overly long prompts." sub="per message">Max tokens / msg</Label>
                              <input
                                type="number"
                                className="input w-full"
                                value={f.maxTokensPerMessage}
                                onChange={(e) => set("maxTokensPerMessage", e.target.value)}
                                placeholder="4000"
                                min={1}
                              />
                            </div>
                            <div>
                              <Label hint="Total tokens a buyer can consume in one session. Resets with cooldown or new purchase." sub="per session">Max tokens / session</Label>
                              <input
                                type="number"
                                className="input w-full"
                                value={f.maxTokensPerSession}
                                onChange={(e) => set("maxTokensPerSession", e.target.value)}
                                placeholder="100000"
                                min={1}
                              />
                            </div>
                            <div>
                              <Label hint="Total tokens allowed within the period window." sub="per period">Max tokens / period</Label>
                              <input
                                type="number"
                                className="input w-full"
                                value={f.maxTokensPerPeriod}
                                onChange={(e) => set("maxTokensPerPeriod", e.target.value)}
                                placeholder="500000"
                                min={1}
                              />
                            </div>
                            <div>
                              <Label hint="Maximum AI cost a single buyer can rack up. Hard stop when reached." sub="per purchase">Cost cap (£)</Label>
                              <input
                                type="number"
                                className="input w-full"
                                value={f.costCapCents}
                                onChange={(e) => set("costCapCents", e.target.value)}
                                placeholder="50.00"
                                min={0}
                                step={0.01}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Feature toggles */}
                        <div className="mt-4 rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--line)" }}>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Feature toggles</p>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Uses more tokens
                            </span>
                          </div>
                          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                            Enable advanced capabilities buyers can use. Each enabled feature increases token consumption.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {[
                              { key: "deepThinkingEnabled" as const, label: "Deep thinking", icon: Brain, desc: "Extended reasoning chains" },
                              { key: "webSearchEnabled" as const, label: "Web search", icon: Search, desc: "Live Google results via Vertex AI Grounding" },
                              { key: "researchAgentEnabled" as const, label: "Research agent", icon: Microscope, desc: "Spawn sub-agents for research" },
                              { key: "codeExecutionEnabled" as const, label: "Code execution", icon: Code, desc: "Generate & run code" },
                              { key: "imageGenerationEnabled" as const, label: "Image generation", icon: Image, desc: "Create images from prompts" },
                            ].map((feat) => {
                              const enabled = f[feat.key];
                              const searchLocked = feat.key === "webSearchEnabled" && webSearchAddon && !webSearchAddon.active;
                              if (searchLocked) {
                                return (
                                  <div
                                    key={feat.key}
                                    className="flex items-center gap-3 rounded-lg border p-3 text-left"
                                    style={{ borderColor: "var(--line)" }}
                                  >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-gray-800">
                                      <feat.icon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{feat.label}</p>
                                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                        Subscribe to the Web Search add-on to turn this on.
                                      </p>
                                      <Link
                                        href="/dashboard/billing"
                                        className="mt-1 inline-block text-[11px] font-medium underline"
                                        style={{ color: "var(--ink)" }}
                                      >
                                        Upgrade on Billing · ${webSearchAddon.amountUsd}/mo
                                      </Link>
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <button
                                  key={feat.key}
                                  type="button"
                                  onClick={() => setForm((p) => ({ ...p, [feat.key]: !p[feat.key] }))}
                                  className={cn(
                                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                                    enabled
                                      ? "border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/30"
                                      : "border-dashed hover:border-solid",
                                  )}
                                  style={enabled ? undefined : { borderColor: "var(--line)" }}
                                >
                                  <div className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                                    enabled ? "bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400" : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                                  )}>
                                    <feat.icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className={cn("text-sm font-medium", enabled ? "text-primary-700 dark:text-primary-300" : "text-gray-700 dark:text-gray-300")}>
                                      {feat.label}
                                    </p>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{feat.desc}</p>
                                  </div>
                                  <div className={cn(
                                    "h-4 w-4 rounded-full border-2 shrink-0",
                                    enabled ? "border-primary-500 bg-primary-500" : "border-gray-300 dark:border-gray-600"
                                  )}>
                                    {enabled && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Metered pricing */}
                        {f.usageMode === "metered" && (
                          <div className="mt-4 rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--line)" }}>
                            <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Metered pricing</p>
                            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                              Charge buyers for each message beyond their included allowance.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label hint="Price per extra message when over the session limit.">Price per extra message (£)</Label>
                                <input
                                  type="number"
                                  className="input w-full"
                                  value={f.meteredPricePerMessageCents}
                                  onChange={(e) => set("meteredPricePerMessageCents", e.target.value)}
                                  placeholder="0.50"
                                  min={0}
                                  step={0.01}
                                />
                              </div>
                              <div>
                                <Label hint="Alternative: price per 1,000 tokens consumed. Overrides per-message price if set.">Price per 1k tokens (£)</Label>
                                <input
                                  type="number"
                                  className="input w-full"
                                  value={f.meteredPricePer1kTokensCents}
                                  onChange={(e) => set("meteredPricePer1kTokensCents", e.target.value)}
                                  placeholder="0.02"
                                  min={0}
                                  step={0.001}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Cooldown period */}
                        {f.usageMode === "included" && (
                          <div className="mt-4">
                            <Label hint="After hitting the session limit, users must wait this long before their session allowance resets. Leave blank for no cooldown.">Session cooldown (minutes)</Label>
                            <input
                              type="number"
                              className="input w-36"
                              value={f.cooldownMinutes}
                              onChange={(e) => set("cooldownMinutes", e.target.value)}
                              placeholder="60"
                              min={1}
                            />
                            <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
                              Leave blank to permanently block users after they reach the session limit.
                            </p>
                          </div>
                        )}

                        {/* Fee calculator */}
                        <div className="mt-4 rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--line)" }}>
                          <div>
                            <Label hint="What you want to earn per sale or per month. Fees are added on top.">Your earnings (£)</Label>
                            <input
                              type="number"
                              className="input w-36"
                              value={f.sellerEarningsCents}
                              onChange={(e) => {
                                set("sellerEarningsCents", e.target.value);
                                // Debounced pricing preview
                                const val = e.target.value;
                                clearTimeout((window as any).__pricingTimeout);
                                (window as any).__pricingTimeout = setTimeout(() => fetchPricingPreview(val), 300);
                              }}
                              placeholder="10.00"
                              min={0}
                              step={0.01}
                            />
                          </div>

                          {pricingPreview && pricingPreview.earningsCents > 0 && (
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between">
                                <span style={{ color: "var(--ink-2)" }}>Your earnings</span>
                                <span className="font-medium" style={{ color: "var(--ink)" }}>£{(pricingPreview.earningsCents / 100).toFixed(2)}</span>
                              </div>
                              {pricingPreview.aiCostCents > 0 && (
                                <div className="flex justify-between">
                                  <span style={{ color: "var(--ink-2)" }}>Est. AI cost per user</span>
                                  <span style={{ color: "var(--ink-2)" }}>£{(pricingPreview.aiCostCents / 100).toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span style={{ color: "var(--ink-2)" }}>Platform fee ({pricingPreview.platformFeePercent}%)</span>
                                <span style={{ color: "var(--ink-2)" }}>£{(pricingPreview.platformFeeCents / 100).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span style={{ color: "var(--ink-2)" }}>Processing fee (est.)</span>
                                <span style={{ color: "var(--ink-2)" }}>£{(pricingPreview.stripeFeeCents / 100).toFixed(2)}</span>
                              </div>
                              <div className="pt-1.5 border-t flex justify-between" style={{ borderColor: "var(--line)" }}>
                                <span className="font-medium" style={{ color: "var(--ink)" }}>Buyer pays</span>
                                <span className="font-bold" style={{ color: "var(--brand)" }}>£{(pricingPreview.buyerTotalCents / 100).toFixed(2)}</span>
                              </div>
                              <div className="pt-1.5 border-t flex justify-between" style={{ borderColor: "var(--line)" }}>
                                <span className="font-medium" style={{ color: "var(--ink)" }}>Your profit per user</span>
                                <span className={pricingPreview.profitCents < 0 ? "font-bold" : "font-bold"} style={{ color: pricingPreview.profitCents < 0 ? "var(--red)" : "#059669" }}>
                                  £{(pricingPreview.profitCents / 100).toFixed(2)}
                                </span>
                              </div>
                              {pricingPreview.profitCents < 0 && (
                                <p className="text-xs font-medium" style={{ color: "var(--red)" }}>
                                  ⚠ You would lose money at this price. Increase your earnings, lower max messages, or switch to a cheaper model.
                                </p>
                              )}
                              {pricingPreview.pricingFound === false && (
                                <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
                                  No catalog price for this model yet — AI cost is omitted until pricing is seeded.
                                </p>
                              )}
                              {pricingPreview.profitCents >= 0 && pricingPreview.aiCostCents > 0 && (
                                <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
                                  AI cost is estimated for {f.maxMessages || 20} messages using {availableModels.find(m => m.id === f.modelId)?.label || f.modelId}. Actual usage may vary.
                                </p>
                              )}
                              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                                Processing fees are estimated ({pricingPreview.stripeFeeRate}). Actual fees may vary slightly.
                              </p>
                            </div>
                          )}

                          {pricingLoading && (
                            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-3)" }}>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Calculating fees…
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex items-start gap-2">
                          <Checkbox
                            id="terms-check"
                            checked={termsAccepted}
                            onCheckedChange={(v) => setTermsAccepted(v === true)}
                          />
                          <label htmlFor="terms-check" className="text-xs leading-relaxed cursor-pointer" style={{ color: "var(--ink-2)" }}>
                            I have read and agree to the{" "}
                            <button
                              type="button"
                              className="underline hover:text-[var(--brand)] transition-colors"
                              style={{ color: "var(--brand)" }}
                              onClick={(e) => { e.preventDefault(); setTermsCheckbox(false); setShowTermsDialog(true); }}
                            >
                              Terms & Conditions
                            </button>{" "}
                            for monetizing this assistant.
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Password protection */}
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" style={{ color: "var(--ink-3)" }} />
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Password protection</p>
                        <p className="text-xs" style={{ color: "var(--ink-3)" }}>Require a password before users can chat</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, passwordProtected: !p.passwordProtected }))}
                      className={cn(
                        "relative h-6 w-11 rounded-full transition-colors",
                        f.passwordProtected ? "bg-[var(--brand)]" : "bg-[var(--ink-4)]",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                          f.passwordProtected ? "left-5.5 translate-x-0" : "left-0.5",
                        )}
                        style={{ left: f.passwordProtected ? 22 : 2 }}
                      />
                    </button>
                  </div>
                  {f.passwordProtected && (
                    <div className="mt-3">
                      <Label hint="Users must enter this password before they can start chatting.">
                        Chat password
                      </Label>
                      <input
                        type="password"
                        className="input w-full"
                        value={f.password}
                        onChange={(e) => set("password", e.target.value)}
                        placeholder={editing ? "Leave blank to keep existing password" : "Enter a password"}
                      />
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Knowledge & Connections ── */}
            <section>
              <SectionHead hint="Give the assistant private documents to reference and external tools it can call.">Knowledge &amp; Connections</SectionHead>
              <div className="space-y-5">

                {/* File upload */}
                <div>
                  <Label
                    hint="Knowledge documents the assistant can reference when answering. Indexed for retrieval — content stays private to your org."
                    sub="PDF, DOCX, TXT, Markdown · max 10 MB each"
                  >
                    Files
                  </Label>

                  {!editing ? (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                      Save the assistant first to add knowledge files.
                    </p>
                  ) : (
                    <>
                      {/* Drop zone */}
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleDocFiles(e.dataTransfer.files); }}
                        onClick={() => docInputRef.current?.click()}
                        className={cn(
                          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors",
                          dragOver ? "border-[var(--brand)] bg-[var(--brand-container)]" : "border-[var(--line)] hover:border-[var(--brand)] hover:bg-[var(--paper-3)]",
                        )}
                      >
                        {docUploading
                          ? <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--ink-3)" }} />
                          : <Upload className="h-6 w-6" style={{ color: "var(--ink-3)" }} />}
                        <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                          Drop files here or <span style={{ color: "var(--brand)" }}>browse</span>
                        </p>
                      </div>
                      <input
                        ref={docInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                        className="sr-only"
                        onChange={(e) => { if (e.target.files) handleDocFiles(e.target.files); }}
                      />

                      {/* Document list */}
                      {docsLoading ? (
                        <div className="flex justify-center py-3">
                          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--ink-3)" }} />
                        </div>
                      ) : documents.length > 0 && (
                        <ul className="mt-3 space-y-2">
                          {documents.map((doc) => (
                            <li key={doc.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--paper-2)" }}>
                              <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--ink-3)" }} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{doc.name}</p>
                                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                                  {doc.fileType?.toUpperCase()} · {formatBytes(doc.fileSizeBytes)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => deleteDocument(doc.id)}
                                className="shrink-0 rounded p-1 transition-colors hover:bg-[var(--red-soft)]"
                                style={{ color: "var(--red)" }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>

                {/* Composio live integration browser */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label hint="Connect external tools (GitHub, Notion, Slack…) via Composio so the assistant can read or write data on your behalf during a conversation.">
                      Integrations <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--brand-container)", color: "var(--brand)" }}>1036+ toolkits</span>
                    </Label>
                    {!editing && <span className="text-xs" style={{ color: "var(--ink-3)" }}>Save assistant first</span>}
                  </div>

                  {/* Search */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                    <input
                      className="input w-full pl-9 text-sm"
                      placeholder="Search toolkits… (GitHub, Notion, Jira, Slack…)"
                      value={appSearch}
                      onChange={(e) => {
                        setAppSearch(e.target.value);
                        loadApps(e.target.value);
                      }}
                      onFocus={() => { if (composioApps.length === 0) loadApps(); }}
                    />
                  </div>

                  {/* App grid */}
                  {appsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
                    </div>
                  ) : composioApps.length === 0 ? (
                    <p className="text-center text-sm py-4" style={{ color: "var(--ink-3)" }}>
                      {appSearch ? "No toolkits found." : "Start typing to search toolkits."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1">
                      {composioApps.map((app) => {
                        const conn = connections.find((c) => c.appSlug === app.slug);
                        const isConnected = conn?.status === "active";
                        const isPending   = conn?.status === "pending" || connecting === app.slug;
                        const toolCount   = conn?.tools?.length ?? 0;
                        return (
                          <button
                            key={app.slug}
                            type="button"
                            disabled={!editing || isPending}
                            onClick={() => openToolPanel(app)}
                            className={cn(
                              "relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                              isConnected
                                ? "border-[var(--green)] bg-[var(--green-soft)]"
                                : "border-[var(--line)] hover:border-[var(--brand)] hover:bg-[var(--paper-3)]",
                              (!editing || isPending) && "opacity-60 cursor-not-allowed",
                            )}
                          >
                            {/* App logo */}
                            <div className="h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: "var(--paper-3)" }}>
                              {app.logo
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={app.logo} alt={app.name} className="h-full w-full object-contain p-1" />
                                : <LinkIcon className="h-4 w-4" style={{ color: "var(--ink-3)" }} />}
                            </div>
                            <span className="text-[11px] font-medium leading-tight" style={{ color: "var(--ink)" }}>{app.name}</span>

                            {!editing ? (
                              <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>Save to connect</span>
                            ) : isConnected ? (
                              <span className="text-[10px] font-semibold" style={{ color: "var(--green)" }}>
                                {toolCount > 0 ? `${toolCount} tool${toolCount > 1 ? "s" : ""}` : "✓ Connected"}
                              </span>
                            ) : isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--brand)" }} />
                            ) : (
                              <span className="text-[10px] font-semibold" style={{ color: "var(--brand)" }}>
                                Select tools →
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Tool selection panel */}
                  {toolPanelApp && (
                    <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--paper-2)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                          {toolPanelApp.name} — Select tools
                        </span>
                        <button
                          type="button"
                          onClick={() => setToolPanelApp(null)}
                          className="rounded p-1 hover:bg-[var(--paper-3)]"
                        >
                          <X className="h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                        </button>
                      </div>
                      {toolsLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--ink-3)" }} />
                        </div>
                      ) : appTools.length === 0 ? (
                        <p className="text-center text-xs py-2" style={{ color: "var(--ink-3)" }}>No tools available.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                          {appTools.map((t) => (
                            <label
                              key={t.slug}
                              className="flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-[var(--paper-3)]"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 shrink-0"
                                checked={selectedToolSlugs.has(t.slug)}
                                onChange={(e) => {
                                  const next = new Set(selectedToolSlugs);
                                  if (e.target.checked) next.add(t.slug);
                                  else next.delete(t.slug);
                                  setSelectedToolSlugs(next);
                                }}
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-medium" style={{ color: "var(--ink)" }}>{t.name}</p>
                                {t.description && (
                                  <p className="text-[11px] leading-tight" style={{ color: "var(--ink-3)" }}>{t.description}</p>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setToolPanelApp(null)}
                          className="btn-ghost btn-sm"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!editing || toolsLoading || selectedToolSlugs.size === 0}
                          onClick={() => {
                            if (!editing || !toolPanelApp) return;
                            connectApp(toolPanelApp, Array.from(selectedToolSlugs));
                            setToolPanelApp(null);
                          }}
                          className="btn-primary btn-sm"
                        >
                          {connecting === toolPanelApp.slug ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Connect selected"
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Connected list summary */}
                  {connections.filter((c) => c.status === "active").length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {connections.filter((c) => c.status === "active").map((c) => (
                        <span
                          key={c.appSlug}
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ background: "var(--green-soft)", color: "var(--green)" }}
                        >
                          {c.appLogo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.appLogo} alt={c.appName ?? ""} className="h-3.5 w-3.5 object-contain rounded" />
                          )}
                          {c.appName ?? c.appSlug}
                          <button
                            type="button"
                            onClick={() => disconnectApp(c.appSlug)}
                            className="ml-0.5 opacity-60 hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* MCP Servers */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label hint="Connect Model Context Protocol (MCP) servers to give your assistant access to local tools, databases, and APIs.">
                      MCP Servers <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--brand-container)", color: "var(--brand)" }}>Beta</span>
                    </Label>
                  </div>
                  <p className="text-xs mb-3" style={{ color: "var(--ink-3)" }}>
                    MCP servers let your assistant call external tools during conversations.
                  </p>

                  {/* MCP server list */}
                  <div className="space-y-2">
                    {f.mcpServers.map((server, idx) => (
                      <div key={server.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Server className="h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                            <input
                              className="text-sm font-medium bg-transparent border-none outline-none p-0 w-40"
                              style={{ color: "var(--ink)" }}
                              value={server.name}
                              onChange={(e) => {
                                const next = [...f.mcpServers];
                                next[idx] = { ...server, name: e.target.value };
                                setForm((p) => ({ ...p, mcpServers: next }));
                              }}
                              placeholder="Server name"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...f.mcpServers];
                                next[idx] = { ...server, enabled: !server.enabled };
                                setForm((p) => ({ ...p, mcpServers: next }));
                              }}
                              className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                                server.enabled
                                  ? "bg-[var(--green-soft)] text-[var(--green)]"
                                  : "bg-[var(--paper-3)] text-[var(--ink-3)]",
                              )}
                            >
                              {server.enabled ? "Enabled" : "Disabled"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = f.mcpServers.filter((_, i) => i !== idx);
                                setForm((p) => ({ ...p, mcpServers: next }));
                              }}
                              className="rounded p-1 transition-colors hover:bg-[var(--red-soft)]"
                              style={{ color: "var(--red)" }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label sub="Command to start the MCP server">Command</Label>
                            <input
                              className="input w-full text-sm font-mono"
                              value={server.command}
                              onChange={(e) => {
                                const next = [...f.mcpServers];
                                next[idx] = { ...server, command: e.target.value };
                                setForm((p) => ({ ...p, mcpServers: next }));
                              }}
                              placeholder="npx, uvx, docker, /path/to/binary..."
                            />
                          </div>
                          <div>
                            <Label sub="One argument per line">Arguments</Label>
                            <textarea
                              className="input w-full text-sm font-mono"
                              rows={3}
                              value={(server.args ?? []).join("\n")}
                              onChange={(e) => {
                                const next = [...f.mcpServers];
                                next[idx] = { ...server, args: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) };
                                setForm((p) => ({ ...p, mcpServers: next }));
                              }}
                              placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/tmp"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setForm((p) => ({
                        ...p,
                        mcpServers: [
                          ...p.mcpServers,
                          { id: crypto.randomUUID(), name: "New MCP Server", command: "", args: [], enabled: true },
                        ],
                      }));
                    }}
                    className="btn-ghost btn-sm mt-3"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add MCP server
                  </button>
                </div>

                {/* ── API Connections ── */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label hint="Connect external REST APIs by providing an API key and documentation URL. An AI helper parses the docs and auto-generates callable tools for your assistant.">
                      API Connections <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--brand-container)", color: "var(--brand)" }}>New</span>
                    </Label>
                  </div>
                  <p className="text-xs mb-3" style={{ color: "var(--ink-3)" }}>
                    Give your assistant access to any REST API. We auto-parse the docs and generate tools.
                  </p>

                  {!editing ? (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                      Save the assistant first to add API connections.
                    </p>
                  ) : (
                    <>
                      {/* Add connection form */}
                      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--line)" }}>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label sub="e.g. Stripe, SendGrid">Name</Label>
                            <input
                              className="input w-full text-sm"
                              value={apiConnForm.name}
                              onChange={(e) => setApiConnForm((p) => ({ ...p, name: e.target.value }))}
                              placeholder="My API"
                            />
                          </div>
                          <div>
                            <Label sub="Base URL">Base URL</Label>
                            <input
                              className="input w-full text-sm"
                              value={apiConnForm.baseUrl}
                              onChange={(e) => setApiConnForm((p) => ({ ...p, baseUrl: e.target.value }))}
                              placeholder="https://api.example.com"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Auth type</Label>
                            <select
                              className="input w-full text-sm"
                              value={apiConnForm.authType}
                              onChange={(e) => setApiConnForm((p) => ({ ...p, authType: e.target.value as any }))}
                            >
                              <option value="bearer">Bearer token</option>
                              <option value="api_key">API key</option>
                              <option value="header">Custom header</option>
                            </select>
                          </div>
                          <div>
                            <Label sub="Optional custom header name">Header name</Label>
                            <input
                              className="input w-full text-sm"
                              value={apiConnForm.apiKeyHeader}
                              onChange={(e) => setApiConnForm((p) => ({ ...p, apiKeyHeader: e.target.value }))}
                              placeholder={apiConnForm.authType === "bearer" ? "Authorization" : "X-Api-Key"}
                            />
                          </div>
                        </div>
                        <div>
                          <Label sub="Will be encrypted">API key / token</Label>
                          <input
                            type="password"
                            className="input w-full text-sm"
                            value={apiConnForm.apiKey}
                            onChange={(e) => setApiConnForm((p) => ({ ...p, apiKey: e.target.value }))}
                            placeholder="sk-..."
                          />
                        </div>
                        <div>
                          <Label sub="URL to API docs (OpenAPI, README, etc.)">Documentation URL</Label>
                          <input
                            className="input w-full text-sm"
                            value={apiConnForm.docsUrl}
                            onChange={(e) => setApiConnForm((p) => ({ ...p, docsUrl: e.target.value }))}
                            placeholder="https://docs.example.com/api"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={addApiConnection}
                          disabled={apiConnAdding}
                          className="btn-primary btn-sm w-full"
                        >
                          {apiConnAdding ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Zap className="h-3.5 w-3.5" />
                          )}
                          {apiConnAdding ? "Auto-configuring…" : "Auto-configure from docs"}
                        </button>
                      </div>

                      {/* Existing connections */}
                      {apiConnLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--ink-3)" }} />
                        </div>
                      ) : apiConnections.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {apiConnections.map((conn) => (
                            <div key={conn.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Plug className="h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                                  <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>{conn.name}</span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--paper-3)", color: "var(--ink-3)" }}>
                                    {conn.baseUrl}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleApiConnection(conn.id)}
                                    className={cn(
                                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                                      conn.enabled
                                        ? "bg-[var(--green-soft)] text-[var(--green)]"
                                        : "bg-[var(--paper-3)] text-[var(--ink-3)]",
                                    )}
                                  >
                                    {conn.enabled ? "Enabled" : "Disabled"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedConnId(expandedConnId === conn.id ? null : conn.id)}
                                    className="rounded p-1 hover:bg-[var(--paper-3)]"
                                  >
                                    {expandedConnId === conn.id ? (
                                      <ChevronUp className="h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteApiConnection(conn.id)}
                                    className="rounded p-1 transition-colors hover:bg-[var(--red-soft)]"
                                    style={{ color: "var(--red)" }}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {expandedConnId === conn.id && (
                                <div className="mt-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>
                                      {conn.endpoints?.filter((e) => e.enabled).length ?? 0} / {conn.endpoints?.length ?? 0} tools active
                                    </p>
                                  </div>
                                  {conn.endpoints && conn.endpoints.length > 0 && (
                                    <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                                      {conn.endpoints.map((ep, i) => (
                                        <label
                                          key={i}
                                          className={cn(
                                            "flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors",
                                            ep.enabled ? "opacity-100" : "opacity-50",
                                          )}
                                          style={{ background: "var(--paper-2)" }}
                                        >
                                          <input
                                            type="checkbox"
                                            className="mt-0.5 shrink-0"
                                            checked={ep.enabled}
                                            onChange={() => toggleEndpoint(conn.id, i)}
                                          />
                                          <span
                                            className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
                                            style={{
                                              background: ep.method === "GET" ? "var(--green-soft)" : ep.method === "POST" ? "var(--brand-container)" : "var(--paper-3)",
                                              color: ep.method === "GET" ? "var(--green)" : ep.method === "POST" ? "var(--brand)" : "var(--ink-3)",
                                            }}
                                          >
                                            {ep.method}
                                          </span>
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium font-mono" style={{ color: "var(--ink)" }}>{ep.path}</p>
                                            <p className="text-[11px] leading-tight" style={{ color: "var(--ink-3)" }}>{ep.description}</p>
                                            {ep.parameters && ep.parameters.length > 0 && (
                                              <p className="text-[10px] mt-0.5" style={{ color: "var(--ink-4)" }}>
                                                Params: {ep.parameters.map((p) => `${p.name} (${p.location})`).join(", ")}
                                              </p>
                                            )}
                                          </div>
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>

          <DialogFooter>
            <button type="button" className="btn-ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !f.name || !f.slug || !f.modelId || (f.monetization !== "free" && !termsAccepted)}
              className="btn-primary"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : editing ? "Save changes" : "Create assistant"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terms & Conditions Dialog */}
      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" style={{ color: "var(--brand)" }} />
              Terms & Conditions
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4 -mr-2">
            <div className="space-y-4 text-sm" style={{ color: "var(--ink-2)" }}>
              <p className="font-medium" style={{ color: "var(--ink)" }}>1. Monetization Agreement</p>
              <p>By enabling monetization for this AI assistant, you agree to comply with all applicable laws and regulations regarding the sale of digital goods and services in your jurisdiction.</p>

              <p className="font-medium" style={{ color: "var(--ink)" }}>2. Pricing & Fees</p>
              <p>You are responsible for setting fair and accurate pricing. Platform processing fees and applicable taxes may be deducted from your earnings. Payouts are subject to verification and minimum thresholds.</p>

              <p className="font-medium" style={{ color: "var(--ink)" }}>3. Content Responsibility</p>
              <p>You retain full responsibility for the content, behaviour, and outputs of your assistant. You must not offer illegal, harmful, discriminatory, or otherwise prohibited content or services.</p>

              <p className="font-medium" style={{ color: "var(--ink)" }}>4. Refund Policy</p>
              <p>For one-time purchases, refunds may be granted at our discretion within 14 days if the assistant is materially non-functional. Subscription refunds are prorated and subject to review.</p>

              <p className="font-medium" style={{ color: "var(--ink)" }}>5. Account Suspension</p>
              <p>We reserve the right to suspend monetization or remove your assistant from the platform if you violate these terms, receive excessive refund requests, or engage in fraudulent activity.</p>

              <p className="font-medium" style={{ color: "var(--ink)" }}>6. Changes to Terms</p>
              <p>These terms may be updated from time to time. Continued use of monetization features after changes constitutes acceptance of the revised terms.</p>
            </div>
          </ScrollArea>
          <DialogFooter className="flex-col gap-3 sm:flex-row">
            <div className="flex items-center gap-2 mr-auto">
              <Checkbox
                id="terms-dialog-check"
                checked={termsCheckbox}
                onCheckedChange={(v) => setTermsCheckbox(v === true)}
              />
              <label htmlFor="terms-dialog-check" className="text-sm cursor-pointer" style={{ color: "var(--ink-2)" }}>
                I agree to the Terms & Conditions
              </label>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setShowTermsDialog(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!termsCheckbox}
              onClick={() => {
                setTermsAccepted(true);
                setShowTermsDialog(false);
                // Auto-save now that terms are accepted
                setTimeout(() => save(), 0);
              }}
            >
              Accept & Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ── */}
      <Dialog
        open={assistantToDelete !== null}
        onOpenChange={(open) => { if (!open) cancelDelete(); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: "var(--red-soft)" }}
                aria-hidden="true"
              >
                <AlertTriangle className="h-5 w-5" style={{ color: "var(--red)" }} />
              </span>
              <div>
                <DialogTitle>Delete assistant?</DialogTitle>
                <DialogDescription>This action is permanent and cannot be undone.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {assistantToDelete && (
            <div className="px-6 py-5 space-y-4">
              {/* Identity preview */}
              <div className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--paper-2)" }}>
                <div
                  className="h-10 w-10 shrink-0 rounded-xl grid place-items-center text-base font-bold text-white overflow-hidden"
                  style={{ background: assistantToDelete.primaryColor ?? "#1A73E8" }}
                  aria-hidden="true"
                >
                  {assistantToDelete.logoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={assistantToDelete.logoUrl} alt="" className="h-full w-full object-cover" />
                    : (assistantToDelete.avatarLetter || assistantToDelete.name.charAt(0)).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{assistantToDelete.name}</p>
                  <p className="truncate font-mono text-xs" style={{ color: "var(--ink-3)" }}>/ai/{assistantToDelete.slug}</p>
                </div>
              </div>

              {/* Consequences */}
              <div className="rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--red-soft)", background: "var(--red-soft)", color: "var(--red)" }}>
                <p className="font-semibold mb-1">The following will also be permanently removed:</p>
                <ul className="list-disc pl-4 space-y-0.5 font-medium">
                  <li>All knowledge documents uploaded to this assistant</li>
                  <li>All connected integrations and tool selections</li>
                  <li>The public link {assistantToDelete.publishedAt ? "(currently live)" : "(if previously published)"}</li>
                  <li>Any conversation history attached to this assistant</li>
                </ul>
              </div>

              {/* Type-to-confirm */}
              <div>
                <Label hint="We require typing the name so you can't accidentally delete the wrong assistant.">
                  Type <span className="font-mono">{assistantToDelete.name}</span> to confirm
                </Label>
                <input
                  className="input w-full"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={assistantToDelete.name}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              className="btn-ghost"
              onClick={cancelDelete}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={
                deleting ||
                !assistantToDelete ||
                deleteConfirmText.trim() !== assistantToDelete?.name
              }
              className="btn-primary"
              style={{ background: "var(--red)" }}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting ? "Deleting…" : "Delete assistant"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
