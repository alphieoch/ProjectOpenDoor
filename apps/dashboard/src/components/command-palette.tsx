"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Key, List, Search } from "lucide-react";

const PAGES = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/models", label: "Models" },
  { href: "/dashboard/chat", label: "OpenDoor Chat" },
  { href: "/dashboard/playground", label: "Playground" },
  { href: "/dashboard/playground/media", label: "Media playground" },
  { href: "/dashboard/premium", label: "Premium" },
  { href: "/dashboard/studio", label: "OpenDoor Studio" },
  { href: "/dashboard/studio", label: "Creative AI Studio (Krea + Runway)" },
  { href: "/dashboard/api-keys", label: "API Keys" },
  { href: "/dashboard/usage", label: "Usage" },
  { href: "/dashboard/logs", label: "Request logs" },
  { href: "/dashboard/training", label: "Training" },
  { href: "/dashboard/pricing", label: "Pricing calculator" },
  { href: "/pricing", label: "Public pricing" },
  { href: "/sdk", label: "SDK & CLI" },
  { href: "/dashboard/deployments", label: "Deployments" },
  { href: "/dashboard/devices", label: "Devices" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/workflow", label: "Workflows" },
  { href: "/dashboard/tools", label: "Tools" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/openbot", label: "Agents · OpenBot" },
  { href: "/dashboard/ai-assistants", label: "Agents · AI Assistants" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/support", label: "Support" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/settings/byok", label: "Provider keys (BYOK)" },
  { href: "/dashboard/audit-logs", label: "Audit logs" },
  { href: "/dashboard/governance", label: "Trust Center" },
  { href: "/dashboard/governance/policies", label: "Policies" },
  { href: "/dashboard/governance/violations", label: "Violations" },
  { href: "/dashboard/governance/approvals", label: "Approvals" },
  { href: "/dashboard/governance/compliance", label: "Compliance" },
];

type Hit = { href: string; label: string; hint?: string; icon: "page" | "model" | "key" };

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [models, setModels] = useState<Array<{ id: string; label: string; provider: string }>>([]);
  const [keys, setKeys] = useState<Array<{ name: string; keyPrefix: string }>>([]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    void Promise.all([
      fetch("/api/models/available", { credentials: "include" }).then((r) => (r.ok ? r.json() : { models: [] })),
      fetch("/api/keys", { credentials: "include" }).then((r) => (r.ok ? r.json() : { keys: [] })),
    ]).then(([m, k]) => {
      setModels(Array.isArray(m.models) ? m.models : []);
      setKeys(Array.isArray(k.keys) ? k.keys : []);
    });
  }, [open]);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pages: Hit[] = PAGES.map((p) => ({ ...p, icon: "page" as const }));
    const modelHits: Hit[] = models.map((m) => {
      const media = /imagen|dall-e|gpt-image|gemini-[\w.-]*-image|(^|[\s/_-])veo([\s/_-]|$)/i.test(
        `${m.id} ${m.label}`,
      );
      return {
        href: media
          ? "/dashboard/playground/media"
          : `/dashboard/playground?model=${encodeURIComponent(m.id)}`,
        label: m.label,
        hint: `${m.id} · ${m.provider}`,
        icon: "model" as const,
      };
    });
    const keyHits: Hit[] = keys.map((k) => ({
      href: "/dashboard/api-keys",
      label: k.name,
      hint: `${k.keyPrefix}…`,
      icon: "key" as const,
    }));
    const all = [...pages, ...modelHits, ...keyHits];
    if (!needle) return all.slice(0, 12);
    return all.filter((h) =>
      `${h.label} ${h.hint ?? ""} ${h.href}`.toLowerCase().includes(needle)
    ).slice(0, 16);
  }, [q, models, keys]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-auto mt-[12vh] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, models, keys…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="font-mono text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {hits.length === 0 && (
            <div className="px-5 py-5 text-center text-sm text-muted-foreground">Nothing matches.</div>
          )}
          {hits.map((h) => (
            <button
              key={`${h.icon}-${h.href}-${h.label}`}
              type="button"
              onClick={() => {
                router.push(h.href);
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-accent"
            >
              {h.icon === "model" ? (
                <List className="h-3.5 w-3.5 text-muted-foreground" />
              ) : h.icon === "key" ? (
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="flex-1 text-sm font-medium">{h.label}</span>
              {h.hint && <span className="font-mono text-[11px] text-muted-foreground">{h.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
