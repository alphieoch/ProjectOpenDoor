"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

type Item = { id: string; kind: string; title: string; href: string; at: string };

export function InboxMenu() {
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
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Notifications"
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 34,
          height: 34,
          display: "grid",
          placeItems: "center",
          borderRadius: 999,
          border: "1px solid transparent",
          background: open ? "var(--paper-3)" : "transparent",
          color: "var(--ink-3)",
          cursor: "pointer",
          position: "relative",
        }}
      >
        <Bell style={{ width: 16, height: 16 }} />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              minWidth: 14,
              height: 14,
              padding: "0 3px",
              borderRadius: 999,
              background: "var(--md-error)",
              color: "white",
              fontSize: 9,
              fontWeight: 700,
              display: "grid",
              placeItems: "center",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="od-card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 320,
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 12, fontWeight: 600 }}>
            Inbox
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {items.length === 0 && (
              <div style={{ padding: 18, fontSize: 13, color: "var(--ink-4)" }}>
                No open violations or pending approvals.
              </div>
            )}
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "10px 14px",
                  textDecoration: "none",
                  borderBottom: "1px solid var(--line-soft)",
                  color: "var(--ink)",
                }}
                className="hover:bg-[var(--paper)]"
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</div>
                <div className="od-mono" style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3 }}>
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
