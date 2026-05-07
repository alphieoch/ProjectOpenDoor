import { LumaSpin } from "@/components/ui/luma-spin";

export default function DashboardLoading() {
  return (
    <div
      className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-5"
      style={{ background: "var(--paper)" }}
    >
      <LumaSpin />
      <p className="text-xs font-medium tracking-wide" style={{ color: "var(--ink-3)" }}>
        Loading…
      </p>
    </div>
  );
}
