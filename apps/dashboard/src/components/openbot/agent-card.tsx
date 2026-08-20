"use client";

import Avatar from "boring-avatars";
import { marbleDrift } from "./marble-drift";

export function OpenBotAgentCard({
  name,
  avatarSeed,
  roleDescription,
}: {
  name: string;
  avatarSeed: string;
  roleDescription: string;
}) {
  const drift = marbleDrift(avatarSeed);

  return (
    <div className="relative h-[180px] w-[144px] overflow-hidden rounded-2xl bg-foreground/10">
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 will-change-transform motion-safe:animate-openbot-marble-drift"
        style={{ animationDelay: `${drift.delay}s`, animationDuration: `${drift.duration}s` }}
      >
        <Avatar name={avatarSeed} size={320} variant="marble" />
      </div>
      <div className="absolute inset-0 bg-background/40 dark:bg-background/50" />
      <div className="absolute inset-0 flex flex-col justify-end gap-2 p-3">
        <span className="line-clamp-1 text-sm font-medium text-foreground">{name}</span>
        <span className="line-clamp-3 text-xs leading-4 text-foreground/80">{roleDescription}</span>
      </div>
    </div>
  );
}
