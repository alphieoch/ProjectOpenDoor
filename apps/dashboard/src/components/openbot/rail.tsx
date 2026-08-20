"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, PanelLeft, PanelLeftClose, Plus, Search, Zap } from "lucide-react";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { isOpenBotReservedPathSegment } from "@opendoor/shared";
import { matchingChannels, initialsFromName } from "@/lib/openbot-personas";
import { LEADERBOT_PERSONA } from "@/lib/openbot-personas";
import { isLeaderbotChannel, pinLeaderbotFirst } from "@/lib/openbot-leader";
import { houseChannelPreview } from "@/lib/openbot-house";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { OpenBotChannelRow } from "./channel-row";
import type { OpenBotChannel } from "./use-openbot-workspace";

const iconBtn =
  "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground";

export function OpenBotRail({
  channels,
  displayName,
  onNewChannel,
  onOpenLeader,
  onHide,
  onPinnedChange,
  onOpenSkills,
  onOpenAgents,
  agentsOpen = false,
  hostedInDashboard = true,
  pinned = true,
}: {
  channels: OpenBotChannel[];
  displayName: string;
  onNewChannel: () => void;
  onOpenLeader?: () => void;
  onHide?: () => void;
  onPinnedChange?: (pinned: boolean) => void;
  onOpenSkills?: () => void;
  onOpenAgents?: () => void;
  agentsOpen?: boolean;
  hostedInDashboard?: boolean;
  pinned?: boolean;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [holdCollapse, setHoldCollapse] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverCollapse = Boolean(onPinnedChange);
  const expanded = pinned || (hoverCollapse && !holdCollapse && (hovered || focused));
  const searching = expanded && query.trim().length > 0;
  const visible = pinLeaderbotFirst(
    matchingChannels(
      channels.map((channel) => ({
        ...channel,
        lastMessage: houseChannelPreview(channel.lastMessage, channel.statusMessage),
      })),
      expanded ? query : "",
    ),
  );
  const showLeaderPlaceholder = Boolean(onOpenLeader) && !searching && !channels.some(isLeaderbotChannel);
  const segment = pathname?.startsWith("/dashboard/openbot/")
    ? pathname.split("/")[3]
    : undefined;
  const onAgents = segment === "agents";
  const activeId = isOpenBotReservedPathSegment(segment) ? undefined : segment;

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  function clearLeaveTimer() {
    window.clearTimeout(leaveTimer.current);
  }

  function onRailEnter() {
    if (!hoverCollapse) return;
    clearLeaveTimer();
    if (!holdCollapse) setHovered(true);
  }

  function onRailLeave() {
    if (!hoverCollapse) return;
    clearLeaveTimer();
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 120;
    leaveTimer.current = setTimeout(() => {
      setHovered(false);
      setHoldCollapse(false);
    }, delay);
  }

  function onRailFocus() {
    if (!hoverCollapse) return;
    clearLeaveTimer();
    if (!holdCollapse) setFocused(true);
  }

  function onRailBlur(event: FocusEvent<HTMLElement>) {
    if (!hoverCollapse) return;
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setFocused(false);
    setHoldCollapse(false);
  }

  function unpin() {
    onPinnedChange?.(false);
    setHovered(false);
    setFocused(false);
    setHoldCollapse(true);
  }

  return (
    <aside
      aria-label="OpenBot channels"
      aria-expanded={expanded}
      data-pinned={pinned ? "true" : "false"}
      onMouseEnter={onRailEnter}
      onMouseLeave={onRailLeave}
      onFocus={onRailFocus}
      onBlur={onRailBlur}
      className={cn(
        "relative z-20 flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-card text-card-foreground",
        "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
        expanded ? "w-[280px]" : "w-12",
      )}
    >
      <div
        className={cn(
          "flex shrink-0",
          "motion-safe:transition-[padding] motion-safe:duration-200 motion-safe:ease-out",
          expanded ? "h-12 flex-row items-center gap-1.5 px-2" : "flex-col items-center gap-1 px-0 pt-3",
        )}
      >
        <Link
          href="/dashboard/openbot"
          tabIndex={expanded ? undefined : -1}
          className={cn(
            "order-1 flex h-full items-center px-2 text-[14px] font-semibold leading-tight tracking-tighter text-foreground",
            "motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out",
            expanded ? "min-w-0 flex-1 opacity-100" : "pointer-events-none h-0 w-0 overflow-hidden p-0 opacity-0",
          )}
        >
          OpenBot
        </Link>
        <button
          type="button"
          aria-label="Start a new channel"
          onClick={onNewChannel}
          className={cn(iconBtn, "order-2")}
        >
          <Plus className="size-4" />
        </button>
        {onHide && !onPinnedChange ? (
          <button type="button" aria-label="Hide channels" onClick={onHide} className={cn(iconBtn, "order-3")}>
            <PanelLeftClose className="size-4" />
          </button>
        ) : null}
        {onPinnedChange ? (
          <button
            type="button"
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin channel rail" : "Pin channel rail"}
            onClick={() => (pinned ? unpin() : onPinnedChange(true))}
            className={cn(iconBtn, expanded ? "order-3" : "order-1")}
          >
            {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          "motion-safe:transition-[padding] motion-safe:duration-200 motion-safe:ease-out",
          expanded ? "px-2" : "px-1.5",
        )}
      >
        <div
          className={cn(
            "overflow-hidden",
            "motion-safe:transition-[height,opacity,margin] motion-safe:duration-200 motion-safe:ease-out",
            expanded ? "mb-2 h-9 opacity-100" : "pointer-events-none mb-0 h-0 opacity-0",
          )}
        >
          <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-muted-foreground">
            <Search className="size-4 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search..."
              aria-label="Search channels"
              tabIndex={expanded ? undefined : -1}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
        </div>

        {expanded && searching && visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No channels match your search</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Nothing here is named “{query.trim()}”, and nobody has said it recently either.
            </p>
          </div>
        ) : null}

        {expanded && !searching && channels.length === 0 && !showLeaderPlaceholder ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center">
            <p className="text-sm font-medium text-foreground">You don&apos;t have channels yet</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Start talking to agents and your channels will appear here.
            </p>
          </div>
        ) : null}

        {expanded && !searching && (visible.length > 0 || showLeaderPlaceholder) ? (
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            House
          </p>
        ) : null}

        <div className={cn("flex flex-col", expanded ? "gap-px" : "items-center gap-1")}>
          {showLeaderPlaceholder ? (
            <OpenBotChannelRow
              id="leader"
              name={LEADERBOT_PERSONA.name}
              avatarSeed={LEADERBOT_PERSONA.avatarSeed}
              lastMessage={LEADERBOT_PERSONA.roleDescription}
              badge="House"
              collapsed={!expanded}
              onOpen={onOpenLeader}
            />
          ) : null}
          {visible.map((channel) => (
            <OpenBotChannelRow
              key={channel.id}
              id={channel.id}
              name={channel.name}
              avatarSeed={channel.id}
              lastMessage={houseChannelPreview(channel.lastMessage, channel.statusMessage)}
              lastMessageAt={channel.lastMessageAt || channel.lastUsedAt || channel.updatedAt}
              status={channel.status}
              computerStatus={channel.workspace?.computer?.status}
              active={activeId === channel.id}
              collapsed={!expanded}
              badge={isLeaderbotChannel(channel) ? "House" : undefined}
            />
          ))}
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col border-t border-border",
          expanded ? "gap-px p-2" : "items-center gap-1 p-2",
        )}
      >
        {!hostedInDashboard && expanded ? (
          <div className="flex h-10 items-center justify-between rounded-lg px-1.5">
            <span className="text-sm text-muted-foreground">Appearance</span>
            <ThemeToggle />
          </div>
        ) : null}
        <button
          type="button"
          onClick={onOpenSkills}
          disabled={!onOpenSkills}
          title={expanded ? undefined : "Skills"}
          aria-label={expanded ? undefined : "Skills"}
          className={cn(
            "flex items-center rounded-lg hover:bg-accent",
            expanded ? "h-10 gap-2 px-1.5 text-sm text-foreground/80" : "size-8 justify-center text-muted-foreground",
          )}
        >
          <span className="grid size-7 place-items-center">
            <Box className="size-4" />
          </span>
          <span
            className={cn(
              "motion-safe:transition-opacity motion-safe:duration-200",
              expanded ? "opacity-100" : "sr-only opacity-0",
            )}
          >
            Skills
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenAgents}
          disabled={!onOpenAgents}
          title={expanded ? undefined : "Agents"}
          aria-label={expanded ? undefined : "Agents"}
          aria-pressed={agentsOpen || undefined}
          aria-current={onAgents ? "page" : undefined}
          className={cn(
            "flex items-center rounded-lg hover:bg-accent",
            expanded ? "h-10 gap-2 px-1.5 text-sm text-foreground/80" : "size-8 justify-center text-muted-foreground",
            (agentsOpen || onAgents) && "bg-accent text-foreground",
            !expanded && (agentsOpen || onAgents) && "ring-2 ring-ring/50",
          )}
        >
          <span className="grid size-7 place-items-center">
            <Zap className="size-4" />
          </span>
          <span
            className={cn(
              "motion-safe:transition-opacity motion-safe:duration-200",
              expanded ? "opacity-100" : "sr-only opacity-0",
            )}
          >
            Agents
          </span>
        </button>
        {!hostedInDashboard && expanded ? (
          <Link
            href="/dashboard/settings"
            className="flex h-10 items-center gap-2 rounded-lg px-1.5 text-sm text-foreground/80 hover:bg-accent"
          >
            <span className="grid size-7 place-items-center rounded-full bg-muted text-[11px] text-muted-foreground">
              {initialsFromName(displayName)}
            </span>
            <span className="truncate">{displayName}</span>
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
