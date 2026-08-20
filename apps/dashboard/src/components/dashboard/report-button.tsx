"use client";

import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { Flag, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Severity = "low" | "medium" | "high" | "critical";

function posthogRequestHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  try {
    const sid = posthog.get_session_id();
    const did = posthog.get_distinct_id();
    if (typeof sid === "string" && sid) h["x-posthog-session-id"] = sid;
    if (typeof did === "string" && did) h["x-posthog-distinct-id"] = did;
  } catch {
    /* PostHog optional */
  }
  return h;
}

function defaultSubject(pathname: string): string {
  const path = pathname || "/";
  return `User report: ${path}`.slice(0, 200);
}

export function ReportButton() {
  const pathname = usePathname() || "/";
  const dialogId = useId();
  const titleId = useId();
  const messageId = useId();
  const severityId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const pageUrl =
      typeof window !== "undefined"
        ? window.location.href
        : pathname;
    const text =
      message.trim() ||
      "(No message provided — see page URL and session metadata.)";

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...posthogRequestHeaders(),
        },
        body: JSON.stringify({
          subject: defaultSubject(pathname),
          body: text,
          severity,
          pageUrl,
          source: "report_button",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ticket?: { identifier?: string };
      };
      if (!res.ok) {
        setError(data.error || "Could not send your report. Try again.");
        return;
      }
      const id = data.ticket?.identifier;
      setSuccess(id ? `Sent to the team as ${id}.` : "Sent to the team.");
      setMessage("");
      setSeverity("medium");
      try {
        posthog.capture("user_report_submitted", {
          severity,
          page_path: pathname,
          linear_identifier: id,
        });
      } catch {
        /* optional */
      }
    } catch {
      setError("Could not send your report. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed z-40",
          "right-4 bottom-6",
          "max-md:right-4 max-md:bottom-[calc(7.75rem+env(safe-area-inset-bottom,0px))]",
        )}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "pointer-events-auto shadow-md border-border bg-background/95 backdrop-blur-sm",
            "hover:bg-accent",
          )}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          onClick={() => setOpen(true)}
        >
          <Flag className="h-4 w-4" aria-hidden />
          Report
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          id={dialogId}
          className="sm:max-w-[420px]"
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => {
            const target = event.currentTarget.querySelector("textarea");
            if (target instanceof HTMLTextAreaElement) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle id={titleId}>Report a problem</DialogTitle>
            <DialogDescription>
              Sends a ticket to the OpenDoor team with this page, your account, and
              browser details. Optional note helps us reproduce it.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-4 overflow-y-auto px-6 py-4">
              <div>
                <label
                  htmlFor={messageId}
                  className="mb-1.5 block text-sm font-medium text-muted-foreground"
                >
                  What went wrong? <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  id={messageId}
                  className="input w-full min-h-[120px]"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What happened, and what did you expect?"
                  maxLength={4000}
                  disabled={saving}
                />
              </div>
              <div>
                <label
                  htmlFor={severityId}
                  className="mb-1.5 block text-sm font-medium text-muted-foreground"
                >
                  Severity
                </label>
                <select
                  id={severityId}
                  className="input w-full"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  disabled={saving}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground truncate" title={pathname}>
                Page: {pathname}
              </p>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="text-sm text-foreground" role="status">
                  {success}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                {success ? "Close" : "Cancel"}
              </Button>
              <Button type="submit" disabled={saving || Boolean(success)}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {saving ? "Sending…" : "Send to humans"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
