"use client";

import Link from "next/link";
import { formatChannelTime, snippet } from "@/lib/openbot-personas";
import { cn } from "@/lib/utils";
import { avatarVisual, avatarVisualLabel } from "./avatar-status";
import { GradientAvatar } from "./gradient-avatar";

export function OpenBotChannelRow({
  id,
  name,
  avatarSeed,
  lastMessage,
  lastMessageAt,
  status,
  computerStatus,
  active,
  collapsed,
  badge,
  onOpen,
}: {
  id: string;
  name: string;
  avatarSeed: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  status?: string | null;
  computerStatus?: string | null;
  active?: boolean;
  collapsed?: boolean;
  badge?: string;
  onOpen?: () => void;
}) {
  const visual = avatarVisual({ status, computerStatus });
  const label = visual === "idle" ? name : `${name}, ${avatarVisualLabel(visual)}`;

  return (
    <Link
      href={`/dashboard/openbot/${id}`}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? (badge ? `${label} · ${badge}` : label) : undefined}
      aria-current={active ? "page" : undefined}
      onClick={
        onOpen
          ? (event) => {
              event.preventDefault();
              onOpen();
            }
          : undefined
      }
      className={cn(
        "flex w-full items-center rounded-lg hover:bg-accent",
        "motion-safe:transition-[padding,gap] motion-safe:duration-200 motion-safe:ease-out",
        collapsed ? "justify-center px-0 py-1.5" : "gap-2 px-2 py-2",
        active && "bg-accent",
        collapsed && active && "ring-2 ring-ring/50",
      )}
    >
      <GradientAvatar
        seed={avatarSeed}
        name={collapsed ? undefined : name}
        size={32}
        status={status}
        computerStatus={computerStatus}
      />
      <div
        aria-hidden={collapsed || undefined}
        className={cn(
          "min-w-0 overflow-hidden",
          "motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out",
          collapsed ? "pointer-events-none h-0 w-0 flex-none opacity-0" : "flex-1 opacity-100",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] tracking-[-0.01em] text-foreground">{name}</span>
            {badge ? (
              <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                {badge}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-[12px] text-muted-foreground/70">{formatChannelTime(lastMessageAt)}</span>
        </div>
        <div className="mt-px h-4 truncate text-[12px] leading-4 text-muted-foreground">
          {snippet(lastMessage) || "Ready"}
        </div>
      </div>
    </Link>
  );
}
