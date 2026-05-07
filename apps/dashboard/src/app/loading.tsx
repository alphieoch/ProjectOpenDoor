import { LumaSpin } from "@/components/ui/luma-spin";

export default function RootLoading() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f7f9ff]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-24rem] h-[48rem] w-[48rem] -translate-x-1/2 rounded-full bg-blue-200/50 blur-3xl" />
        <div className="absolute right-[-14rem] top-40 h-[32rem] w-[32rem] rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute bottom-20 left-[-16rem] h-[34rem] w-[34rem] rounded-full bg-indigo-200/40 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6">
        <LumaSpin />
        <p className="text-sm font-medium text-slate-500">Loading OpenDoor…</p>
      </div>
    </div>
  );
}
