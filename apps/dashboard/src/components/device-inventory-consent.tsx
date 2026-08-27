"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type ConsentPayload = {
  granted: boolean;
  purpose: string;
  grantedAt: string | null;
};

export function DeviceInventoryConsent({
  onChange,
}: {
  onChange?: (granted: boolean) => void;
}) {
  const [consent, setConsent] = useState<ConsentPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/devices/consent", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load permission"))))
      .then((data) => {
        if (cancelled) return;
        const next = data.consent as ConsentPayload;
        setConsent(next);
        onChange?.(Boolean(next?.granted));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load permission");
      });
    return () => {
      cancelled = true;
    };
  }, [onChange]);

  async function setGranted(granted: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/devices/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ granted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save permission");
      const next = data.consent as ConsentPayload;
      setConsent(next);
      onChange?.(Boolean(next?.granted));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save permission");
    } finally {
      setBusy(false);
    }
  }

  if (!consent && !error) {
    return (
      <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))", textAlign: "left" }}>
        Checking permission…
      </p>
    );
  }

  if (consent?.granted) {
    return (
      <div style={{ textAlign: "left" }}>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          You allowed a one-time read of this machine so we can show dedicated-metal capacity. You can withdraw that permission.
        </p>
        <button
          type="button"
          className="btn-secondary mt-3"
          disabled={busy}
          onClick={() => void setGranted(false)}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Withdraw permission
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "left" }}>
      <p className="text-sm" style={{ lineHeight: 1.55, color: "hsl(var(--muted-foreground))" }}>
        We do not read this machine unless you allow it. If you allow, we look at Metal or GPU presence,
        usable memory, Ollama status, and local model tags — only to say whether dedicated metals can run a model.
        This is optional. Ochieng & Co cloud services work without it.{" "}
        <Link href="/privacy" className="underline" style={{ color: "hsl(var(--muted-foreground))" }}>
          Privacy policy
        </Link>
        .
      </p>
      {error ? (
        <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => void setGranted(true)}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Allow device read
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => void setGranted(false)}
        >
          Do not allow
        </button>
      </div>
    </div>
  );
}
