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
  { href: "/dashboard/deployments", label: "Deployments" },
  { href: "/dashboard/devices", label: "Devices" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/workflow", label: "Workflows" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/ai-assistants", label: "AI Assistants" },
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
    const pages: Hit[] = PAGES.map((p) => ({ ...p, icon: "page" }));
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
      icon: "key",
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
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(18,16,12,0.28)" }}
      onClick={onClose}
    >
      <div
        className="od-card"
        style={{
          width: "min(560px, calc(100vw - 32px))",
          margin: "12vh auto 0",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
          <Search style={{ width: 16, height: 16, color: "var(--ink-3)" }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, models, keys…"
            style={{ flex: 1, border: 0, outline: "none", background: "transparent", fontSize: 14, color: "var(--ink)" }}
          />
          <kbd className="od-mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>esc</kbd>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {hits.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
              Nothing matches.
            </div>
          )}
          {hits.map((h) => (
            <button
              key={`${h.icon}-${h.href}-${h.label}`}
              type="button"
              onClick={() => {
                router.push(h.href);
                onClose();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                border: 0,
                background: "transparent",
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left",
                color: "var(--ink)",
              }}
              className="hover:bg-[var(--paper)]"
            >
              {h.icon === "model" ? <List style={{ width: 14, height: 14, color: "var(--ink-3)" }} /> : h.icon === "key" ? <Key style={{ width: 14, height: 14, color: "var(--ink-3)" }} /> : <Search style={{ width: 14, height: 14, color: "var(--ink-3)" }} />}
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{h.label}</span>
              {h.hint && <span className="od-mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{h.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
