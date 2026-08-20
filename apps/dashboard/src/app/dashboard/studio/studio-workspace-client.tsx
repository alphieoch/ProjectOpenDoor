"use client";

import dynamic from "next/dynamic";

const StudioWorkspace = dynamic(
  () => import("@/components/studio/StudioWorkspace").then((m) => m.StudioWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading Studio…
      </div>
    ),
  },
);

export function StudioWorkspaceClient() {
  return <StudioWorkspace />;
}
