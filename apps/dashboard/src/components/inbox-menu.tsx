"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Item = { id: string; kind: string; title: string; href: string; at: string };

export function InboxMenu({
  placement = "right-end",
}: {
  placement?: "bottom-end" | "right-end" | "top-end";
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { items: [], unread: 0 }))
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setUnread(Number(data.unread || 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative h-8 w-8"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-[14px] place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-[14px] text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div
          className={cn(
            "z-50 w-80 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg",
            placement === "right-end" && "absolute bottom-0 left-full ml-2",
            placement === "top-end" && "absolute right-0 bottom-[calc(100%+8px)]",
            placement === "bottom-end" && "absolute right-0 top-[calc(100%+8px)]",
          )}
        >
          <div className="border-b border-border px-3.5 py-2.5 text-xs font-semibold">Inbox</div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <div className="px-4 py-5 text-sm text-muted-foreground">
                No open violations or pending approvals.
              </div>
            )}
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block border-b border-border px-3.5 py-2.5 text-foreground last:border-0 hover:bg-accent",
                )}
              >
                <div className="text-sm font-medium">{item.title}</div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {new Date(item.at).toLocaleString()}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
