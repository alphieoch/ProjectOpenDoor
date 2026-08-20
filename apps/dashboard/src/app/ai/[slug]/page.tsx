"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AiCrest } from "@/components/ui/ai-crest";
import { ChatInterface } from "./ChatInterface";

type AssistantPayload = {
  name: string;
  description: string | null;
  primaryColor: string;
  avatarLetter: string;
  logoUrl: string | null;
  welcomeMessage: string | null;
  maxMessages: number | null;
  isOwner: boolean;
  publishedAt: string | null;
  enabled: boolean;
  visibility: string | null;
};

export default function PublicChatPage() {
  const router = useRouter();
  const routeParams = useParams<{ slug: string }>();
  const slugRaw = routeParams.slug;
  const slug = Array.isArray(slugRaw) ? slugRaw[0] : slugRaw;

  const [payload, setPayload] = React.useState<AssistantPayload | null>(null);
  const [deniedMsg, setDeniedMsg] = React.useState<string | null>(null);
  const [missingAssistant, setMissingAssistant] = React.useState(false);

  React.useEffect(() => {
    if (!slug) return;

    let cancelled = false;

    async function load() {
      setPayload(null);
      setDeniedMsg(null);
      setMissingAssistant(false);

      const res = await fetch(`/api/public/assistants/${encodeURIComponent(slug)}`, {
        credentials: "include",
      });

      const bodyText = await res.text();
      let body: unknown = null;
      try {
        body = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        body = null;
      }

      if (cancelled) return;

      if (res.status === 404) {
        setMissingAssistant(true);
        return;
      }

      if (res.status === 403) {
        const errObj = body && typeof body === "object" && body !== null ? (body as { error?: string }) : {};
        const err = String(errObj.error || "Forbidden");

        if (err === "Team only") {
          router.replace(`/login?redirect=/ai/${encodeURIComponent(slug)}`);
          return;
        }

        if (err === "Private") {
          setDeniedMsg("This assistant is private.");
          return;
        }

        setDeniedMsg("You don't have access to this assistant.");
        return;
      }

      if (!res.ok) {
        setDeniedMsg("Something went wrong loading this assistant.");
        return;
      }

      if (body && typeof body === "object" && body !== null && "name" in body && "slug" in body) {
        setPayload(body as AssistantPayload);
      } else {
        setDeniedMsg("Something went wrong loading this assistant.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  if (!slug) {
    return (
      <div
        className="flex flex-col h-dvh items-center justify-center bg-[var(--paper)] text-[var(--ink)]"
        style={{ fontFamily: "inherit" }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--brand)]" aria-hidden />
        <p className="mt-3 text-sm text-[var(--ink-3)]">Loading…</p>
      </div>
    );
  }

  if (missingAssistant) {
    return <AssistantNotFound slug={slug} />;
  }

  if (deniedMsg) {
    return <AccessDenied message={deniedMsg} />;
  }

  if (!payload) {
    return (
      <div
        className="flex flex-col h-dvh items-center justify-center bg-[var(--paper)] text-[var(--ink)]"
        style={{ fontFamily: "inherit" }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--brand)]" aria-hidden />
        <p className="mt-3 text-sm text-[var(--ink-3)]">Loading assistant…</p>
      </div>
    );
  }

  const primaryColor = payload.primaryColor ?? "#0F172A";
  const avatarLetter = payload.avatarLetter ?? payload.name.charAt(0).toUpperCase();
  const logoUrl = payload.logoUrl;

  return (
    <div
      className="flex flex-col h-dvh bg-[var(--paper)] text-[var(--ink)]"
      style={{ fontFamily: "inherit" }}
    >
      <header
        className="flex-shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b absolute top-0 inset-x-0 z-10 backdrop-blur-sm"
        style={{
          background: "color-mix(in srgb, var(--paper-2) 80%, transparent)",
          borderColor: "var(--line)",
        }}
      >
        <div className="w-8 h-8 flex items-center justify-center select-none">
          {logoUrl
            ? // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={payload.name} className="h-8 w-8 rounded-lg object-cover" />
            : <AiCrest mood="ready" size={22} />}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-sm leading-tight truncate" style={{ color: "var(--ink)" }}>
            {payload.name}
          </span>
          {payload.description && (
            <span className="text-xs leading-tight truncate" style={{ color: "var(--ink-3)" }}>
              {payload.description}
            </span>
          )}
        </div>

        {payload.isOwner && !payload.publishedAt && (
          <div className="ml-2 flex items-center gap-1.5 bg-amber-400/90 rounded-full px-3 py-1">
            <span className="text-amber-950 text-xs font-semibold">Preview</span>
          </div>
        )}

        <div
          className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 border"
          style={{ borderColor: "var(--line)", background: "var(--paper-3)" }}
        >
          <AiCrest mood="ready" size={16} />
          <span className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>
            OpenDoor AI
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex justify-center p-3 sm:p-4">
        <div
          className="w-full max-w-3xl flex flex-col rounded-xl border shadow-sm overflow-hidden"
          style={{
            background: "var(--paper-2)",
            borderColor: "var(--line)",
          }}
        >
          <div className="h-[60px] flex-shrink-0" />

          <ChatInterface
            slug={slug}
            welcomeMessage={payload.welcomeMessage}
            primaryColor={primaryColor}
            avatarLetter={avatarLetter}
            logoUrl={logoUrl}
            maxMessages={payload.maxMessages}
            assistantName={payload.name}
            assistantDescription={payload.description}
          />
        </div>
      </div>
    </div>
  );
}

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-[var(--paper)] text-[var(--ink)]">
      <div className="w-16 h-16 rounded-2xl bg-[var(--paper-3)] flex items-center justify-center">
        <AiCrest mood="error" size={32} />
      </div>
      <h1 className="text-xl font-semibold">{message}</h1>
      <p className="text-sm text-[var(--ink-3)]">
        Contact the assistant owner for access.
      </p>
    </div>
  );
}

function AssistantNotFound({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-[var(--paper)] text-[var(--ink)] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--paper-3)] flex items-center justify-center">
        <AiCrest mood="idle" size={32} />
      </div>
      <h1 className="text-xl font-semibold">Assistant not found</h1>
      <p className="max-w-md text-sm text-[var(--ink-3)]">
        No assistant exists at <span className="font-mono text-[var(--ink)]">/ai/{slug}</span>, or it is not published yet.
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-[var(--brand)] underline-offset-4 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
