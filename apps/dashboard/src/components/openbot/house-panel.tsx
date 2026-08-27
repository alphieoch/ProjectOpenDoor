"use client";

import Link from "next/link";
import { formatChannelTime, snippet } from "@/lib/openbot-personas";
import {
  houseChannelPreview,
  openBotHouseView,
  type HouseMember,
} from "@/lib/openbot-house";
import { GradientAvatar } from "./gradient-avatar";

export function OpenBotHousePanel({
  agents,
  hrefFor,
  emptyMembers = "No other coworkers in this house yet.",
}: {
  agents: HouseMember[];
  hrefFor: (agent: HouseMember) => string;
  emptyMembers?: string;
}) {
  const house = openBotHouseView(agents);
  if (house.bots.length === 0) return null;

  const headerHref = house.leader ? hrefFor(house.leader) : "/dashboard/openbot";
  const headerName = house.leader?.name || "OpenBot";
  const headerSeed = house.leader?.id || "openbot-house";

  return (
    <section
      aria-label="OpenBot house"
      className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground"
    >
      <Link
        href={headerHref}
        className="flex items-start gap-3 px-4 py-4 no-underline transition-colors hover:bg-accent/60"
      >
        <GradientAvatar
          seed={headerSeed}
          name={headerName}
          size={40}
          status={house.leader?.status}
          computerStatus={house.leader?.workspace?.computer?.status}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{headerName}</p>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              House
            </span>
            {house.leader ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Lead
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{house.status.line}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {house.status.total === 1
              ? "1 coworker in this house"
              : `${house.status.total} coworkers in this house`}
            {house.status.running > 0 ? ` · ${house.status.running} running` : ""}
          </p>
        </div>
      </Link>

      <div className="border-t border-border">
        {house.members.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{emptyMembers}</p>
        ) : (
          <ul>
            {house.members.map((member) => {
              const preview = snippet(houseChannelPreview(member.lastMessage, member.statusMessage));
              return (
                <li key={member.id} className="border-t border-border first:border-t-0">
                  <Link
                    href={hrefFor(member)}
                    className="flex items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-accent/60"
                  >
                    <GradientAvatar
                      seed={member.id}
                      name={member.name}
                      size={32}
                      status={member.status}
                      computerStatus={member.workspace?.computer?.status}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{member.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatChannelTime(member.lastMessageAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {preview || "Ready"}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
