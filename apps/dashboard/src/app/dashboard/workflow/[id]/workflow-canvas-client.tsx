"use client";

import dynamic from "next/dynamic";

const WorkflowCanvas = dynamic(() => import("./workflow-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading workflow canvas…
    </div>
  ),
});

export function WorkflowCanvasClient() {
  return <WorkflowCanvas />;
}
