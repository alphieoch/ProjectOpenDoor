"use client";

import { useState, useEffect } from "react";
import {
  Bot, Plus, Copy, Check, Globe, Lock, Users,
  Pencil, Trash2, Radio, Loader2, ExternalLink,
} from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ── Types ── */
interface AIAssistant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarLetter: string | null;
  primaryColor: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  welcomeMessage: string | null;
  maxMessages: number | null;
  visibility: string | null;
  monetization: string | null;
  priceCents: number | null;
  publishedAt: string | null;
  createdAt: string;
}

/* ── Constants ── */
const MODELS = [
  { id: "gpt-4o",                     label: "GPT-4o",            provider: "OpenAI"    },
  { id: "gpt-4o-mini",                label: "GPT-4o Mini",       provider: "OpenAI"    },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "claude-3-haiku-20240307",    label: "Claude 3 Haiku",    provider: "Anthropic" },
  { id: "gemini-1.5-pro",             label: "Gemini 1.5 Pro",    provider: "Google"    },
  { id: "gemini-1.5-flash",           label: "Gemini 1.5 Flash",  provider: "Google"    },
  { id: "mistral-large-latest",       label: "Mistral Large",     provider: "Mistral"   },
  { id: "command-r-plus",             label: "Command R+",        provider: "Cohere"    },
];

const COLORS = ["#1A73E8", "#7C3AED", "#059669", "#DC2626", "#D97706", "#0891B2", "#374151"];

const defaultForm = {
  name: "", slug: "", description: "",
  avatarLetter: "", primaryColor: "#1A73E8",
  modelId: "gpt-4o", systemPrompt: "", welcomeMessage: "",
  maxMessages: "", visibility: "private",
  monetization: "free", priceCents: "",
};

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function VisibilityIcon({ v }: { v: string | null }) {
  if (v === "public") return <Globe className="h-3.5 w-3.5" />;
  if (v === "team")   return <Users className="h-3.5 w-3.5" />;
  return <Lock className="h-3.5 w-3.5" />;
}

/* ── Field label ── */
function Label({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--ink)" }}>
      {children}
      {sub && <span className="ml-1 font-normal text-xs" style={{ color: "var(--ink-3)" }}>{sub}</span>}
    </label>
  );
}

/* ── Section header inside dialog ── */
function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--ink-4)" }}>
      <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      {children}
      <span className="h-px flex-1" style={{ background: "var(--line)" }} />
    </p>
  );
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

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/ai-assistants").then((r) => r.json());
    setAssistants(data.assistants ?? []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(a: AIAssistant) {
    setEditing(a);
    setForm({
      name: a.name, slug: a.slug, description: a.description ?? "",
      avatarLetter: a.avatarLetter ?? "", primaryColor: a.primaryColor ?? "#1A73E8",
      modelId: a.modelId ?? "gpt-4o", systemPrompt: a.systemPrompt ?? "",
      welcomeMessage: a.welcomeMessage ?? "", maxMessages: a.maxMessages?.toString() ?? "",
      visibility: a.visibility ?? "private", monetization: a.monetization ?? "free",
      priceCents: a.priceCents ? (a.priceCents / 100).toString() : "",
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name || !form.slug) return;
    setSaving(true);
    const body = {
      ...form,
      avatarLetter: form.avatarLetter || form.name.charAt(0).toUpperCase(),
      priceCents: form.priceCents ? Math.round(parseFloat(form.priceCents) * 100) : 0,
      maxMessages: form.maxMessages ? parseInt(form.maxMessages) : null,
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

  async function remove(id: string) {
    if (!confirm("Delete this assistant?")) return;
    await fetch(`/api/ai-assistants/${id}`, { method: "DELETE" });
    load();
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/ai/${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  }

  const f = form;
  const set = (k: keyof typeof defaultForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  /* ── Preview colour for avatar ── */
  const previewColor = f.primaryColor || "#1A73E8";
  const previewLetter = f.avatarLetter || f.name.charAt(0).toUpperCase() || "A";

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">AI Assistants</h1>
          <p className="page-desc">Create, brand, and publish AI assistants powered by OpenDoor's gateway.</p>
        </div>
        <button onClick={openCreate} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" /> Create assistant
        </button>
      </div>

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
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {assistants.map((a) => {
            const color = a.primaryColor ?? "#1A73E8";
            const live  = !!a.publishedAt;
            return (
              <div key={a.id} className="card flex flex-col overflow-hidden">
                <div className="h-1.5 w-full" style={{ background: color }} />
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-bold text-white"
                      style={{ background: color }}
                    >
                      {a.avatarLetter || a.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold" style={{ color: "var(--ink)" }}>{a.name}</p>
                      <p className="truncate font-mono text-xs" style={{ color: "var(--ink-3)" }}>/{a.slug}</p>
                    </div>
                  </div>

                  {a.description && (
                    <p className="mt-3 text-sm leading-relaxed line-clamp-2" style={{ color: "var(--ink-2)" }}>{a.description}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}>
                      <VisibilityIcon v={a.visibility} /> {a.visibility ?? "private"}
                    </span>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--brand-container)", color: "var(--brand)" }}>
                      {MODELS.find((m) => m.id === a.modelId)?.label ?? a.modelId}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={live
                        ? { background: "var(--green-soft)", color: "var(--green)" }
                        : { background: "var(--paper-3)",   color: "var(--ink-3)"  }}
                    >
                      <Radio className="h-3 w-3" /> {live ? "Live" : "Draft"}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                    {live && (
                      <>
                        <a href={`/ai/${a.slug}`} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </a>
                        <button onClick={() => copyLink(a.slug)} className="btn-ghost btn-sm">
                          {copied === a.slug ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied === a.slug ? "Copied" : "Copy link"}
                        </button>
                      </>
                    )}
                    <button onClick={() => openEdit(a)} className="btn-ghost btn-sm ml-auto">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => togglePublish(a)}
                      disabled={publishing === a.id}
                      className="btn-ghost btn-sm"
                      style={{ color: live ? "var(--ink-3)" : "var(--brand)" }}
                    >
                      {publishing === a.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Radio className="h-3.5 w-3.5" />}
                      {live ? "Unpublish" : "Publish"}
                    </button>
                    <button onClick={() => remove(a.id)} className="btn-ghost btn-sm" style={{ color: "var(--red)" }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">

          {/* Header */}
          <DialogHeader>
            <div className="flex items-center gap-3">
              {/* Live avatar preview */}
              <div
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold text-white transition-all"
                style={{ background: previewColor }}
              >
                {previewLetter}
              </div>
              <DialogTitle>{editing ? "Edit assistant" : "Create AI assistant"}</DialogTitle>
            </div>
          </DialogHeader>

          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

            {/* ── Basics ── */}
            <section>
              <SectionHead>Basics</SectionHead>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Name *</Label>
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
                    <Label sub={f.slug ? <>— <span className="font-mono">/ai/{f.slug}</span></> : undefined}>Slug *</Label>
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
                  <Label>Description</Label>
                  <textarea
                    className="input w-full"
                    rows={2}
                    value={f.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="What does this assistant do?"
                  />
                </div>

                <div>
                  <Label>Brand colour</Label>
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
                    {/* Custom colour swatch */}
                    <label className="relative h-7 w-7 cursor-pointer" title="Custom colour">
                      <span
                        className="block h-7 w-7 rounded-full border-2 border-dashed transition-all hover:scale-110"
                        style={{ borderColor: "var(--line)", background: COLORS.includes(f.primaryColor) ? "transparent" : f.primaryColor }}
                      />
                      <input
                        type="color"
                        value={f.primaryColor}
                        onChange={(e) => set("primaryColor", e.target.value)}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Model & Prompt ── */}
            <section>
              <SectionHead>Model &amp; Prompt</SectionHead>
              <div className="space-y-4">
                <div>
                  <Label>Model</Label>
                  <Select value={f.modelId} onValueChange={(v) => set("modelId", v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span>{m.label}</span>
                          <span className="ml-1.5 text-xs opacity-50">({m.provider})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>System prompt</Label>
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
                    <Label>Welcome message</Label>
                    <input
                      className="input w-full"
                      value={f.welcomeMessage}
                      onChange={(e) => set("welcomeMessage", e.target.value)}
                      placeholder="Hello! How can I help you today?"
                    />
                  </div>
                  <div>
                    <Label sub="leave blank for unlimited">Max messages / session</Label>
                    <input
                      type="number"
                      className="input w-full"
                      value={f.maxMessages}
                      onChange={(e) => set("maxMessages", e.target.value)}
                      placeholder="20"
                      min={1}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ── Access & Pricing ── */}
            <section>
              <SectionHead>Access &amp; Pricing</SectionHead>
              <div className="space-y-5">
                <div>
                  <Label>Visibility</Label>
                  <div className="grid grid-cols-3 gap-3 mt-1.5">
                    {[
                      { value: "private", icon: Lock,  label: "Private", desc: "Only you"             },
                      { value: "team",    icon: Users,  label: "Team",    desc: "Your org members"     },
                      { value: "public",  icon: Globe,  label: "Public",  desc: "Anyone with the link" },
                    ].map(({ value, icon: Icon, label, desc }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => set("visibility", value)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border p-3.5 text-sm transition-all",
                          f.visibility === value
                            ? "border-[var(--brand)] bg-[var(--brand-container)]"
                            : "border-[var(--line)] hover:bg-[var(--paper-3)]",
                        )}
                      >
                        <Icon
                          className="h-4 w-4"
                          style={{ color: f.visibility === value ? "var(--brand)" : "var(--ink-3)" }}
                        />
                        <span className="font-semibold text-xs" style={{ color: "var(--ink)" }}>{label}</span>
                        <span className="text-xs leading-tight text-center" style={{ color: "var(--ink-3)" }}>{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {f.visibility === "public" && (
                  <div>
                    <Label>Monetization</Label>
                    <div className="grid grid-cols-3 gap-3 mt-1.5">
                      {[
                        { value: "free",        label: "Free",         desc: "No charge"      },
                        { value: "one_time",     label: "One-time",     desc: "Single payment" },
                        { value: "subscription", label: "Subscription", desc: "Monthly"        },
                      ].map(({ value, label, desc }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => set("monetization", value)}
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
                      <div className="mt-4">
                        <Label>Price (£)</Label>
                        <input
                          type="number"
                          className="input w-36"
                          value={f.priceCents}
                          onChange={(e) => set("priceCents", e.target.value)}
                          placeholder="9.99"
                          min={0}
                          step={0.01}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Footer */}
          <DialogFooter>
            <button type="button" className="btn-ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !f.name || !f.slug}
              className="btn-primary"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : editing ? "Save changes" : "Create assistant"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
